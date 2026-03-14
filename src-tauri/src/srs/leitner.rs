use chrono::Utc;

use super::strategy::SRSStrategy;
use super::types::*;

const INTERVALS: [f64; 5] = [1.0, 3.0, 7.0, 14.0, 30.0];

pub struct LeitnerStrategy;

impl LeitnerStrategy {
    pub fn new() -> Self {
        Self
    }
}

impl SRSStrategy for LeitnerStrategy {
    fn schedule(&self, card: &CardProgress, rating: Rating) -> ScheduleResult {
        let current_box = card.box_number.unwrap_or(0);

        let new_box = match rating {
            Rating::Again => 1,
            Rating::Hard => current_box.max(1),
            Rating::Good => (current_box + 1).min(5),
            Rating::Easy => (current_box + 2).min(5),
        };

        let interval = INTERVALS[(new_box - 1) as usize];
        let due = Utc::now() + chrono::Duration::seconds((interval * 86400.0) as i64);

        let state = if new_box == 1 {
            CardState::Learning
        } else {
            CardState::Review
        };

        ScheduleResult {
            interval_days: interval,
            due_date: due.to_rfc3339(),
            state: state.as_str().to_string(),
            algorithm_state: serde_json::json!({ "box_number": new_box }),
        }
    }

    fn initial_intervals(&self) -> Vec<f64> {
        INTERVALS.to_vec()
    }

    fn algorithm_name(&self) -> &'static str {
        "leitner"
    }
}
