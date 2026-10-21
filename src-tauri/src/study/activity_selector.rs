// =============================================================================
// Study engine — activity selector (ported from activity-selector.ts)
// =============================================================================
// Pure function. Picks the best activity_type for a (card, user).
// =============================================================================

use super::rng::next_f64;
use super::types::*;
use std::collections::HashSet;

pub struct SelectionInput<'a> {
    pub proficiency: &'a CardProficiency,
    pub config: &'a PracticeConfig,
    pub has_audio_clip: bool,
    pub available_templates: &'a HashSet<ActivityType>,
    pub user_has_microphone: bool,
}

pub fn select_activity(input: &SelectionInput) -> ActivityType {
    let stage = input.proficiency.learning_stage;
    let default_rule = StageRule::default();
    let stage_rule = input.config.stage_overrides.get(&stage).unwrap_or(&default_rule);

    // 1. force_activities short-circuits everything.
    if let Some(forced) = &stage_rule.force_activities {
        if !forced.is_empty() {
            let allowed: Vec<(ActivityType, f64)> = forced
                .iter()
                .copied()
                .filter(|a| input.config.enabled_activities.contains(a) && is_applicable(*a, input))
                .map(|a| (a, weight_for(a, input.config, input.proficiency)))
                .collect();
            if !allowed.is_empty() {
                return weighted_pick(&allowed);
            }
        }
    }

    // 2. Candidate set = enabled ∩ applicable.
    let mut candidates: Vec<(ActivityType, f64)> = input
        .config
        .enabled_activities
        .iter()
        .copied()
        .filter(|a| is_applicable(*a, input))
        .map(|a| (a, weight_for(a, input.config, input.proficiency)))
        .collect();

    if candidates.is_empty() {
        return ActivityType::Recall;
    }

    // 3. prefer_activities boost.
    if let Some(preferred) = &stage_rule.prefer_activities {
        if !preferred.is_empty() {
            let boost = stage_rule.boost.unwrap_or(1.5);
            for c in candidates.iter_mut() {
                if preferred.contains(&c.0) {
                    c.1 *= boost;
                }
            }
        }
    }

    // 4. Weighted-random pick (proportional to weight).
    weighted_pick(&candidates)
}

/// Effective weight = user weight × (1 - dimension_score), floored at 0.1.
fn weight_for(activity: ActivityType, config: &PracticeConfig, prof: &CardProficiency) -> f64 {
    let user_weight = config.activity_weights.get(&activity).copied().unwrap_or(1.0);
    let dimension = activity.dimension();
    let gap = 1.0 - prof.score_for(dimension);
    user_weight * gap.max(0.1)
}

/// Hard preconditions that make an activity impossible for a given context.
///
/// `available_templates` is the per-card set of generative activities the serve
/// step can actually produce content for: cached templates, plus notes-derivable
/// ones, plus everything the local model can generate when AI is enabled. The
/// payload builder still degrades to recall if generation fails at serve time.
///
/// `use_in_sentence` needs no generated content — its payload is just the target
/// word — so it is always applicable. (The cloud version gated it behind a
/// template row, which made its template-free branch unreachable dead code.)
pub fn is_applicable(activity: ActivityType, input: &SelectionInput) -> bool {
    use ActivityType::*;
    match activity {
        ListenAgain => input.config.use_listen_again && input.has_audio_clip,
        SpeakTest => input.user_has_microphone,
        Cloze | SynonymDiscrim | MiniReading => input.available_templates.contains(&activity),
        Recall | TypeTest | UseInSentence => true,
    }
}

fn weighted_pick(items: &[(ActivityType, f64)]) -> ActivityType {
    if items.is_empty() {
        return ActivityType::Recall;
    }
    let total: f64 = items.iter().map(|(_, w)| w.max(0.0)).sum();
    if total <= 0.0 {
        return items[0].0;
    }
    let mut r = next_f64() * total;
    for (a, w) in items {
        r -= w.max(0.0);
        if r <= 0.0 {
            return *a;
        }
    }
    items[items.len() - 1].0
}
