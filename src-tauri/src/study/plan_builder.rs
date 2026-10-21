// =============================================================================
// Study engine — plan builder (ported from plan-builder.ts)
// =============================================================================
// Builds today's queue (PlanItem[]) from due/new/weak cards + proficiency.
// Pure logic — no DB.
// =============================================================================

use super::activity_selector::{select_activity, SelectionInput};
use super::types::*;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone)]
pub struct DueCardInput {
    pub card_id: String,
    pub deck_id: String,
    pub days_overdue: f64,
    pub is_leech: bool,
}

#[derive(Debug, Clone)]
pub struct DeckMetaInput {
    pub total_cards: i64,
    pub days_since_practice: f64,
}

pub struct BuildPlanArgs<'a> {
    pub config: &'a PracticeConfig,
    pub due_cards: Vec<DueCardInput>,
    pub proficiency_by_card: &'a HashMap<String, CardProficiency>,
    pub has_audio_by_card: &'a HashMap<String, bool>,
    pub template_available_by_card: &'a HashMap<String, HashSet<ActivityType>>,
    pub deck_meta: &'a HashMap<String, DeckMetaInput>,
    pub user_has_microphone: bool,
    pub study_ahead: bool,
}

pub struct BuildPlanResult {
    pub items: Vec<PlanItem>,
    pub estimated_minutes: i64,
}

pub fn build_daily_plan(args: BuildPlanArgs) -> BuildPlanResult {
    let config = args.config;

    // 1. Filter cards by deck_strategy.
    let cards = apply_deck_strategy(&args);
    if cards.is_empty() {
        return BuildPlanResult {
            items: vec![],
            estimated_minutes: 0,
        };
    }

    // 2. Compute priority + sort (desc).
    let mut prioritized: Vec<(DueCardInput, f64)> = cards
        .into_iter()
        .map(|c| {
            let p = card_priority(&c, &args);
            (c, p)
        })
        .collect();
    prioritized.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let prioritized: Vec<DueCardInput> = prioritized.into_iter().map(|(c, _)| c).collect();

    // 3. Cap at capacity (deck-balance trims for mix mode).
    let base_capacity = capacity_from_minutes(config.daily_minutes);
    let capacity = if args.study_ahead {
        (base_capacity * 4).max(600)
    } else {
        base_capacity
    };

    let pool: Vec<DueCardInput> = if config.deck_strategy == DeckStrategy::Mix {
        enforce_deck_balance(prioritized, capacity)
    } else {
        prioritized.into_iter().take(capacity as usize).collect()
    };

    // 4. Per-card activity selection.
    let empty_templates: HashSet<ActivityType> = HashSet::new();
    let raw_items: Vec<PlanItem> = pool
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let default_prof = CardProficiency::new(&c.card_id, &c.deck_id);
            let proficiency = args
                .proficiency_by_card
                .get(&c.card_id)
                .unwrap_or(&default_prof);
            let has_audio = *args.has_audio_by_card.get(&c.card_id).unwrap_or(&false);
            let tpl_set = args
                .template_available_by_card
                .get(&c.card_id)
                .unwrap_or(&empty_templates);
            let input = SelectionInput {
                proficiency,
                config,
                has_audio_clip: has_audio,
                available_templates: tpl_set,
                user_has_microphone: args.user_has_microphone,
            };
            let activity_type = select_activity(&input);
            PlanItem {
                card_id: c.card_id.clone(),
                deck_id: c.deck_id.clone(),
                activity_type,
                order_index: i as i64,
                primary_dimension: activity_type.dimension(),
            }
        })
        .collect();

    // 5. Interleave so we don't see N of the same activity in a row.
    let interleaved = interleave_by_activity_type(raw_items);

    // 6. Estimate time.
    let total_seconds: f64 = interleaved.iter().map(|it| it.activity_type.est_seconds()).sum();
    let estimated_minutes = (total_seconds / 60.0).ceil() as i64;

    // 7. Renumber order_index.
    let items: Vec<PlanItem> = interleaved
        .into_iter()
        .enumerate()
        .map(|(i, mut it)| {
            it.order_index = i as i64;
            it
        })
        .collect();

    BuildPlanResult {
        items,
        estimated_minutes,
    }
}

fn apply_deck_strategy(args: &BuildPlanArgs) -> Vec<DueCardInput> {
    let config = args.config;
    match config.deck_strategy {
        DeckStrategy::Isolated => match &config.active_deck_id {
            None => vec![],
            Some(active) => args
                .due_cards
                .iter()
                .filter(|c| &c.deck_id == active)
                .cloned()
                .collect(),
        },
        DeckStrategy::Rotation => match pick_rotation_deck(args.deck_meta) {
            None => vec![],
            Some(deck) => args
                .due_cards
                .iter()
                .filter(|c| c.deck_id == deck)
                .cloned()
                .collect(),
        },
        DeckStrategy::Mix => args.due_cards.clone(),
    }
}

fn pick_rotation_deck(deck_meta: &HashMap<String, DeckMetaInput>) -> Option<String> {
    let mut entries: Vec<(&String, &DeckMetaInput)> = deck_meta.iter().collect();
    if entries.is_empty() {
        return None;
    }
    // Most-neglected wins; ties → larger card count.
    entries.sort_by(|a, b| {
        if a.1.days_since_practice != b.1.days_since_practice {
            b.1.days_since_practice
                .partial_cmp(&a.1.days_since_practice)
                .unwrap_or(std::cmp::Ordering::Equal)
        } else {
            b.1.total_cards.cmp(&a.1.total_cards)
        }
    });
    Some(entries[0].0.clone())
}

fn card_priority(card: &DueCardInput, args: &BuildPlanArgs) -> f64 {
    let deck_weight = args
        .config
        .deck_weights
        .get(&card.deck_id)
        .copied()
        .unwrap_or(1.0);
    let deck_neglect = args
        .deck_meta
        .get(&card.deck_id)
        .map(|m| m.days_since_practice)
        .unwrap_or(0.0);
    let prof_gap = match args.proficiency_by_card.get(&card.card_id) {
        Some(p) => 1.0 - p.avg(),
        None => 0.7, // unknown card = high priority
    };

    deck_weight
        + (card.days_overdue / 14.0).min(1.0) * 1.5
        + (deck_neglect / 14.0).min(1.0) * 0.8
        + if card.is_leech { 0.5 } else { 0.0 }
        + prof_gap * 0.7
}

/// No deck takes more than its fair share in mix mode.
fn enforce_deck_balance(cards: Vec<DueCardInput>, capacity: i64) -> Vec<DueCardInput> {
    let capacity = capacity.max(0) as usize;
    let deck_ids: Vec<String> = {
        let mut seen = HashSet::new();
        let mut order = Vec::new();
        for c in &cards {
            if seen.insert(c.deck_id.clone()) {
                order.push(c.deck_id.clone());
            }
        }
        order
    };
    if deck_ids.len() <= 1 {
        return cards.into_iter().take(capacity).collect();
    }

    // Group by deck, preserving priority order within each deck.
    let mut by_deck: HashMap<String, std::collections::VecDeque<DueCardInput>> = HashMap::new();
    for id in &deck_ids {
        by_deck.insert(id.clone(), std::collections::VecDeque::new());
    }
    for c in cards {
        by_deck.get_mut(&c.deck_id).unwrap().push_back(c);
    }

    // Per-deck cap = ceil(capacity / min(deckCount, 3)).
    let divisor = deck_ids.len().min(3);
    let cap = capacity.div_ceil(divisor);

    let mut result: Vec<DueCardInput> = Vec::new();
    let mut counts: HashMap<String, usize> = HashMap::new();

    let mut progressed = true;
    while progressed && result.len() < capacity {
        progressed = false;
        for id in &deck_ids {
            if result.len() >= capacity {
                break;
            }
            let cur = *counts.get(id).unwrap_or(&0);
            let queue = by_deck.get_mut(id).unwrap();
            if cur >= cap || queue.is_empty() {
                continue;
            }
            result.push(queue.pop_front().unwrap());
            counts.insert(id.clone(), cur + 1);
            progressed = true;
        }
    }

    // Draw freely from the rest if still under capacity.
    if result.len() < capacity {
        for id in &deck_ids {
            let queue = by_deck.get_mut(id).unwrap();
            while !queue.is_empty() && result.len() < capacity {
                result.push(queue.pop_front().unwrap());
            }
        }
    }

    result
}

/// Break up activity-type runs (round-robin, largest bucket first).
fn interleave_by_activity_type(items: Vec<PlanItem>) -> Vec<PlanItem> {
    if items.len() <= 2 {
        return items;
    }
    let total = items.len();

    let mut buckets: HashMap<ActivityType, std::collections::VecDeque<PlanItem>> = HashMap::new();
    let mut order_seen: Vec<ActivityType> = Vec::new();
    for it in items {
        let t = it.activity_type;
        buckets.entry(t).or_default().push_back(it);
        if !order_seen.contains(&t) {
            order_seen.push(t);
        }
    }

    // Largest bucket first.
    let mut order: Vec<ActivityType> = order_seen;
    order.sort_by(|a, b| {
        buckets
            .get(b)
            .map(|q| q.len())
            .unwrap_or(0)
            .cmp(&buckets.get(a).map(|q| q.len()).unwrap_or(0))
    });

    let mut out: Vec<PlanItem> = Vec::new();
    let mut last_type: Option<ActivityType> = None;
    while out.len() < total {
        let mut placed = false;
        // First pass: avoid repeating the last type.
        for t in &order {
            if Some(*t) == last_type {
                continue;
            }
            if let Some(q) = buckets.get_mut(t) {
                if let Some(item) = q.pop_front() {
                    out.push(item);
                    last_type = Some(*t);
                    placed = true;
                    break;
                }
            }
        }
        // Second pass: take whatever's left, even if it repeats.
        if !placed {
            for t in &order {
                if let Some(q) = buckets.get_mut(t) {
                    if let Some(item) = q.pop_front() {
                        out.push(item);
                        last_type = Some(*t);
                        placed = true;
                        break;
                    }
                }
            }
        }
        if !placed {
            break; // safety
        }
    }

    out
}

fn capacity_from_minutes(mins: i64) -> i64 {
    // ~12 seconds avg per activity.
    (((mins as f64) * 60.0 / 12.0).round() as i64).max(5)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::study::config::build_default_config;

    fn due(card: &str, deck: &str, overdue: f64) -> DueCardInput {
        DueCardInput {
            card_id: card.to_string(),
            deck_id: deck.to_string(),
            days_overdue: overdue,
            is_leech: false,
        }
    }

    #[test]
    fn builds_queue_and_estimates_minutes() {
        let config = build_default_config("2026-07-08T00:00:00Z");
        let prof = HashMap::new();
        let audio = HashMap::new();
        let templates = HashMap::new();
        let deck_meta = HashMap::new();
        let res = build_daily_plan(BuildPlanArgs {
            config: &config,
            due_cards: vec![due("a", "d", 3.0), due("b", "d", 1.0), due("c", "d", 0.0)],
            proficiency_by_card: &prof,
            has_audio_by_card: &audio,
            template_available_by_card: &templates,
            deck_meta: &deck_meta,
            user_has_microphone: false,
            study_ahead: false,
        });
        assert_eq!(res.items.len(), 3);
        assert!(res.estimated_minutes >= 1);
        // order_index is contiguous from 0.
        for (i, it) in res.items.iter().enumerate() {
            assert_eq!(it.order_index, i as i64);
        }
    }

    #[test]
    fn empty_pool_yields_empty_plan() {
        let config = build_default_config("2026-07-08T00:00:00Z");
        let res = build_daily_plan(BuildPlanArgs {
            config: &config,
            due_cards: vec![],
            proficiency_by_card: &HashMap::new(),
            has_audio_by_card: &HashMap::new(),
            template_available_by_card: &HashMap::new(),
            deck_meta: &HashMap::new(),
            user_has_microphone: false,
            study_ahead: false,
        });
        assert_eq!(res.items.len(), 0);
        assert_eq!(res.estimated_minutes, 0);
    }
}
