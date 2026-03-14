use chrono::Utc;

use super::strategy::SRSStrategy;
use super::types::*;

pub struct SM2Strategy;

impl SM2Strategy {
    pub fn new() -> Self {
        Self
    }

    fn rating_to_quality(rating: Rating) -> i32 {
        match rating {
            Rating::Again => 1,
            Rating::Hard => 2,
            Rating::Good => 4,
            Rating::Easy => 5,
        }
    }
}

impl SRSStrategy for SM2Strategy {
    fn schedule(&self, card: &CardProgress, rating: Rating) -> ScheduleResult {
        let q = Self::rating_to_quality(rating);
        let old_ef = card.easiness_factor.unwrap_or(2.5);
        let old_reps = card.repetitions.unwrap_or(0);
        let old_interval = card.interval_days;

        let ef_delta = 0.1 - (5.0 - q as f64) * (0.08 + (5.0 - q as f64) * 0.02);
        let new_ef = (old_ef + ef_delta).max(1.3);

        let (new_interval, new_reps, state) = if q < 3 {
            (1.0, 0, CardState::Relearning)
        } else {
            let interval = match old_reps {
                0 => 1.0,
                1 => 6.0,
                _ => (old_interval * new_ef).round(),
            };
            (interval, old_reps + 1, CardState::Review)
        };

        let due = Utc::now() + chrono::Duration::seconds((new_interval * 86400.0) as i64);

        ScheduleResult {
            interval_days: new_interval,
            due_date: due.to_rfc3339(),
            state: state.as_str().to_string(),
            algorithm_state: serde_json::json!({
                "easiness_factor": new_ef,
                "repetitions": new_reps,
            }),
        }
    }

    fn initial_intervals(&self) -> Vec<f64> {
        vec![1.0, 6.0]
    }

    fn algorithm_name(&self) -> &'static str {
        "sm2"
    }
}
