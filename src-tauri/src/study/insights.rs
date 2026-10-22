// =============================================================================
// Study engine — the per-CARD view of a session, and shadowing's time ledger.
// =============================================================================
// Pure logic only (no DB, no Tauri), so it is unit-tested directly. Ported from
// flexi-lingo-core/functions/practice-session/services/session-service.ts
// (`buildSessionInsights`) and services/shadow-xp.ts.
//
// Everything else in the session summary counts ACTIVITIES. This counts cards,
// which is what the learner actually experienced: a word answered wrong and then
// right is ONE card that took two tries, not one failure and one success.
// =============================================================================

use serde::Serialize;
use std::collections::HashMap;

/// Answer times above this are the learner being away, not thinking.
pub const ACTIVE_TIME_CAP_MS: i64 = 120_000;
/// Below this many attempts a card was simply missed once — not a struggle.
pub const STRUGGLE_MIN_ATTEMPTS: i64 = 3;
/// The report is a prompt to act, not a list to read. Keep it short.
pub const STRUGGLE_LIMIT: usize = 8;
/// Days of due-forecast to return, starting at today (0).
pub const FORECAST_DAYS: i64 = 7;
const CEFR_ORDER: [&str; 6] = ["A1", "A2", "B1", "B2", "C1", "C2"];

/// Seconds of study that earn one time XP.
pub const SECONDS_PER_TIME_XP: i64 = 120;
/// What shadowing can be worth in a day, in seconds of ACTUAL playback. Not a rate
/// limit — a meaning limit: a run left going overnight must not mint XP all night.
pub const SHADOW_DAILY_CAP_SECONDS: i64 = 20 * 60;
/// Nothing plausible arrives in one report; anything larger is a bad clock or a replay.
pub const SHADOW_MAX_REPORT_SECONDS: i64 = 30 * 60;

/// One graded-or-not answer of the session, oldest first.
#[derive(Debug, Clone)]
pub struct AttemptRow {
    pub card_id: Option<String>,
    pub is_correct: Option<bool>,
    pub response_time_ms: Option<i64>,
    pub front: String,
    /// CEFR level from the card's notes, when it has one.
    pub level: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Struggle {
    pub card_id: String,
    pub front_text: String,
    pub attempts: i64,
    pub ended_correct: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LevelRow {
    pub level: String,
    pub seen: i64,
    pub missed: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ForecastDay {
    pub day_offset: i64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SessionInsights {
    pub unique_cards: i64,
    pub attempts: i64,
    /// Cards right on the first attempt of the session.
    pub first_try_correct: i64,
    /// Cards whose last attempt of the session was right.
    pub ended_correct: i64,
    /// Answering time with each answer capped, so idle gaps don't count as study.
    pub active_seconds: i64,
    pub struggles: Vec<Struggle>,
    /// Only the cards whose level is known — never a session total.
    pub by_level: Vec<LevelRow>,
    /// `day_offset` 0 = today.
    pub forecast: Vec<ForecastDay>,
}

struct PerCard {
    front: String,
    level: Option<String>,
    attempts: i64,
    first_correct: Option<bool>,
    last_correct: Option<bool>,
    order: usize,
}

/// `"b1"`, `" B1 "` -> `Some("B1")`; anything that is not A1..C2 -> `None`.
pub fn normalize_level(raw: &str) -> Option<String> {
    let up = raw.trim().to_uppercase();
    CEFR_ORDER.contains(&up.as_str()).then_some(up)
}

/// Folds the attempt stream down to one entry per card and builds the report.
/// `forecast` is filled by the caller (it needs the DB). `None` when there is
/// nothing graded to report on.
pub fn fold_attempts(rows: &[AttemptRow], forecast: Vec<ForecastDay>) -> Option<SessionInsights> {
    if rows.is_empty() {
        return None;
    }
    let mut by_card: HashMap<&str, PerCard> = HashMap::new();
    let mut active_ms: i64 = 0;
    let mut attempts: i64 = 0;

    for r in rows {
        // Past the cap the learner was away, not thinking; summing raw response
        // times just reproduces wall-clock time.
        active_ms += r.response_time_ms.unwrap_or(0).clamp(0, ACTIVE_TIME_CAP_MS);

        let (Some(card_id), Some(correct)) = (r.card_id.as_deref(), r.is_correct) else {
            continue; // ungraded / not answered
        };
        attempts += 1;
        let next_order = by_card.len();
        let cur = by_card.entry(card_id).or_insert(PerCard {
            front: String::new(),
            level: None,
            attempts: 0,
            first_correct: None,
            last_correct: None,
            order: next_order,
        });
        cur.attempts += 1;
        if cur.first_correct.is_none() {
            cur.first_correct = Some(correct);
        }
        cur.last_correct = Some(correct);
        if cur.front.is_empty() && !r.front.is_empty() {
            cur.front = r.front.clone();
        }
        if cur.level.is_none() {
            cur.level = r.level.as_deref().and_then(normalize_level);
        }
    }
    if by_card.is_empty() {
        return None;
    }

    // Stable order (first appearance) so ties sort the same way every run.
    let mut cards: Vec<(&str, &PerCard)> = by_card.iter().map(|(k, v)| (*k, v)).collect();
    cards.sort_by_key(|(_, c)| c.order);

    let first_try_correct = cards.iter().filter(|(_, c)| c.first_correct == Some(true)).count() as i64;
    let ended_correct = cards.iter().filter(|(_, c)| c.last_correct == Some(true)).count() as i64;

    let mut hard: Vec<&(&str, &PerCard)> = cards
        .iter()
        .filter(|(_, c)| c.attempts >= STRUGGLE_MIN_ATTEMPTS)
        .collect();
    hard.sort_by(|a, b| b.1.attempts.cmp(&a.1.attempts));
    let struggles = hard
        .into_iter()
        .take(STRUGGLE_LIMIT)
        .map(|(id, c)| Struggle {
            card_id: (*id).to_string(),
            front_text: c.front.clone(),
            attempts: c.attempts,
            ended_correct: c.last_correct == Some(true),
        })
        .collect();

    let mut tally: HashMap<String, (i64, i64)> = HashMap::new();
    for (_, c) in &cards {
        if let Some(level) = &c.level {
            let e = tally.entry(level.clone()).or_insert((0, 0));
            e.0 += 1;
            if c.last_correct == Some(false) {
                e.1 += 1;
            }
        }
    }
    let mut by_level: Vec<LevelRow> = tally
        .into_iter()
        .map(|(level, (seen, missed))| LevelRow { level, seen, missed })
        .collect();
    by_level.sort_by_key(|l| CEFR_ORDER.iter().position(|x| *x == l.level).unwrap_or(99));

    Some(SessionInsights {
        unique_cards: cards.len() as i64,
        attempts,
        first_try_correct,
        ended_correct,
        active_seconds: (active_ms as f64 / 1000.0).round() as i64,
        struggles,
        by_level,
        forecast,
    })
}

fn whole(n: i64) -> i64 {
    n.max(0)
}

/// Seconds of a report that still fit under today's ceiling.
pub fn shadow_granted_seconds(used_before: i64, reported: i64) -> i64 {
    let reported = reported.clamp(0, SHADOW_MAX_REPORT_SECONDS);
    (SHADOW_DAILY_CAP_SECONDS - whole(used_before)).max(0).min(reported)
}

/// Time XP a shadowing report is owed: one per two-minute mark the day's running
/// total crossed. Measured on the day's total rather than per report, because a
/// run reports every 30 seconds and flooring each report would pay nothing.
pub fn shadow_time_xp(used_before: i64, granted: i64) -> i64 {
    let before = whole(used_before);
    let granted = whole(granted);
    ((before + granted) / SECONDS_PER_TIME_XP - before / SECONDS_PER_TIME_XP).max(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(card: &str, ok: bool, ms: i64, level: Option<&str>) -> AttemptRow {
        AttemptRow {
            card_id: Some(card.to_string()),
            is_correct: Some(ok),
            response_time_ms: Some(ms),
            front: card.to_string(),
            level: level.map(String::from),
        }
    }

    #[test]
    fn a_word_wrong_then_right_is_one_card_that_ended_correct() {
        let rows = vec![row("a", false, 1000, None), row("a", true, 1000, None), row("b", true, 500, None)];
        let i = fold_attempts(&rows, vec![]).unwrap();
        assert_eq!(i.unique_cards, 2);
        assert_eq!(i.attempts, 3);
        assert_eq!(i.first_try_correct, 1); // b only
        assert_eq!(i.ended_correct, 2); // a turned around
    }

    #[test]
    fn struggles_need_three_tries_hardest_first_and_are_capped() {
        let mut rows = vec![];
        for _ in 0..4 {
            rows.push(row("hard", false, 100, None));
        }
        for _ in 0..3 {
            rows.push(row("meh", false, 100, None));
        }
        rows.push(row("meh", true, 100, None));
        rows.push(row("once", false, 100, None));
        let i = fold_attempts(&rows, vec![]).unwrap();
        assert_eq!(i.struggles.len(), 2);
        assert_eq!(i.struggles[0].card_id, "hard");
        assert_eq!(i.struggles[0].attempts, 4);
        assert!(!i.struggles[0].ended_correct);
        assert_eq!(i.struggles[1].card_id, "meh");
        assert!(i.struggles[1].ended_correct);

        let many: Vec<AttemptRow> = (0..20)
            .flat_map(|n| (0..3).map(move |_| row(&format!("c{n}"), false, 1, None)))
            .collect();
        assert_eq!(fold_attempts(&many, vec![]).unwrap().struggles.len(), STRUGGLE_LIMIT);
    }

    #[test]
    fn active_time_caps_each_answer() {
        let rows = vec![row("a", true, 500_000, None), row("b", true, 2_000, None)];
        assert_eq!(fold_attempts(&rows, vec![]).unwrap().active_seconds, 122);
    }

    #[test]
    fn ungraded_rows_count_for_time_only() {
        let mut rows = vec![row("a", true, 1_000, None)];
        rows.push(AttemptRow { card_id: Some("b".into()), is_correct: None, response_time_ms: Some(4_000), front: "b".into(), level: None });
        let i = fold_attempts(&rows, vec![]).unwrap();
        assert_eq!(i.unique_cards, 1);
        assert_eq!(i.attempts, 1);
        assert_eq!(i.active_seconds, 5);
        let none = vec![AttemptRow { card_id: None, is_correct: None, response_time_ms: None, front: String::new(), level: None }];
        assert!(fold_attempts(&none, vec![]).is_none());
        assert!(fold_attempts(&[], vec![]).is_none());
    }

    #[test]
    fn misses_by_level_use_the_last_attempt_and_sort_a1_to_c2() {
        let rows = vec![
            row("w1", false, 1, Some("b2")),
            row("w2", true, 1, Some("a1")),
            row("w3", false, 1, Some("B2")),
            row("w3", true, 1, Some("B2")), // turned around: not missed
            row("w4", true, 1, Some("zz")), // not a CEFR level: dropped
            row("w5", true, 1, None),
        ];
        let i = fold_attempts(&rows, vec![]).unwrap();
        assert_eq!(
            i.by_level,
            vec![
                LevelRow { level: "A1".into(), seen: 1, missed: 0 },
                LevelRow { level: "B2".into(), seen: 2, missed: 1 },
            ]
        );
        assert_eq!(normalize_level(" c1 "), Some("C1".into()));
        assert_eq!(normalize_level("D9"), None);
    }

    #[test]
    fn shadow_xp_pays_on_the_days_running_total() {
        // Reports of 30 s each: floor-per-report would pay nothing, the running total pays.
        let mut used = 0;
        let mut xp = 0;
        for _ in 0..8 {
            let granted = shadow_granted_seconds(used, 30);
            xp += shadow_time_xp(used, granted);
            used += granted;
        }
        assert_eq!(used, 240);
        assert_eq!(xp, 2);
    }

    #[test]
    fn shadow_time_stops_paying_at_the_daily_ceiling() {
        assert_eq!(shadow_granted_seconds(0, 5_000), SHADOW_MAX_REPORT_SECONDS.min(SHADOW_DAILY_CAP_SECONDS));
        assert_eq!(shadow_granted_seconds(1_190, 60), 10);
        assert_eq!(shadow_granted_seconds(1_200, 60), 0);
        assert_eq!(shadow_granted_seconds(0, -4), 0);
        assert_eq!(shadow_time_xp(1_200, 0), 0);
    }
}
