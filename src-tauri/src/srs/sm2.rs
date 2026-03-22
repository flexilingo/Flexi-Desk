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
            Rating::Hard => 3,
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

        // SM-2: quality < 3 requeues; quality >= 3 is correct
        let should_requeue = q < 3;
        let was_correct = q >= 3;

        ScheduleResult {
            interval_days: new_interval,
            due_date: due.to_rfc3339(),
            state: state.as_str().to_string(),
            algorithm_state: serde_json::json!({
                "easiness_factor": new_ef,
                "repetitions": new_reps,
            }),
            should_requeue,
            was_correct,
        }
    }

    fn initial_intervals(&self) -> Vec<f64> {
        vec![1.0, 6.0]
    }

    fn algorithm_name(&self) -> &'static str {
        "sm2"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn card(ef: f64, reps: i32, interval: f64) -> CardProgress {
        CardProgress {
            card_id: "c1".into(),
            algorithm: Algorithm::SM2,
            box_number: None,
            easiness_factor: Some(ef),
            repetitions: Some(reps),
            stability: None,
            difficulty: None,
            state: CardState::Review,
            interval_days: interval,
            due_date: Utc::now(),
            last_review: None,
            review_count: reps,
            lapses: 0,
        }
    }

    #[test]
    fn test_again_resets() {
        let s = SM2Strategy::new();
        let result = s.schedule(&card(2.5, 3, 10.0), Rating::Again);
        assert_eq!(result.interval_days, 1.0);
        assert_eq!(result.state, "relearning");
        assert_eq!(result.algorithm_state["repetitions"], 0);
    }

    #[test]
    fn test_hard_advances() {
        // Hard has quality=3 >= 3, so it advances (correct but difficult)
        let s = SM2Strategy::new();
        let result = s.schedule(&card(2.5, 3, 10.0), Rating::Hard);
        assert!(result.interval_days > 1.0, "Hard should advance interval");
        assert_eq!(result.state, "review");
    }

    #[test]
    fn test_hard_lowers_ef() {
        let s = SM2Strategy::new();
        let result = s.schedule(&card(2.5, 3, 10.0), Rating::Hard);
        let new_ef = result.algorithm_state["easiness_factor"].as_f64().unwrap();
        assert!(new_ef < 2.5, "EF should decrease for Hard: got {new_ef}");
    }

    #[test]
    fn test_good_first_rep() {
        let s = SM2Strategy::new();
        let result = s.schedule(&card(2.5, 0, 0.0), Rating::Good);
        assert_eq!(result.interval_days, 1.0);
        assert_eq!(result.state, "review");
        assert_eq!(result.algorithm_state["repetitions"], 1);
    }

    #[test]
    fn test_good_second_rep() {
        let s = SM2Strategy::new();
        let result = s.schedule(&card(2.5, 1, 1.0), Rating::Good);
        assert_eq!(result.interval_days, 6.0);
        assert_eq!(result.state, "review");
    }

    #[test]
    fn test_easy_raises_ef() {
        let s = SM2Strategy::new();
        let result = s.schedule(&card(2.5, 2, 6.0), Rating::Easy);
        let new_ef = result.algorithm_state["easiness_factor"].as_f64().unwrap();
        assert!(new_ef > 2.5, "EF should increase for Easy: got {new_ef}");
    }

    #[test]
    fn test_ef_never_below_floor() {
        let s = SM2Strategy::new();
        let mut ef = 2.5;
        for _ in 0..20 {
            let c = card(ef, 5, 20.0);
            let result = s.schedule(&c, Rating::Hard);
            ef = result.algorithm_state["easiness_factor"].as_f64().unwrap();
            assert!(ef >= 1.3, "EF dropped below floor: {ef}");
        }
    }

    #[test]
    fn test_rep2_uses_ef_multiplier() {
        // At reps=2 the interval = round(old_interval * new_ef)
        // Good has quality=4, ef_delta=0.0 → new_ef stays the same
        let s = SM2Strategy::new();
        let ef = 2.5;
        let old_interval = 6.0;
        let result = s.schedule(&card(ef, 2, old_interval), Rating::Good);
        let expected = (old_interval * ef).round();
        assert_eq!(result.interval_days, expected);
    }
}
