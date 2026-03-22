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
            Rating::Again => (current_box - 1).max(1),
            Rating::Hard => current_box.max(1),
            Rating::Good => (current_box + 1).min(5),
            Rating::Easy => (current_box + 1).min(5),
        };

        let interval = INTERVALS[(new_box - 1) as usize];
        let due = Utc::now() + chrono::Duration::seconds((interval * 86400.0) as i64);

        let state = if new_box == 1 {
            CardState::Learning
        } else {
            CardState::Review
        };

        // Leitner: Again requeues; only Good/Easy are correct
        let should_requeue = matches!(rating, Rating::Again);
        let was_correct = matches!(rating, Rating::Good | Rating::Easy);

        ScheduleResult {
            interval_days: interval,
            due_date: due.to_rfc3339(),
            state: state.as_str().to_string(),
            algorithm_state: serde_json::json!({ "box_number": new_box }),
            should_requeue,
            was_correct,
        }
    }

    fn initial_intervals(&self) -> Vec<f64> {
        INTERVALS.to_vec()
    }

    fn algorithm_name(&self) -> &'static str {
        "leitner"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn card(box_number: i32) -> CardProgress {
        CardProgress {
            card_id: "c1".into(),
            algorithm: Algorithm::Leitner,
            box_number: Some(box_number),
            easiness_factor: None,
            repetitions: None,
            stability: None,
            difficulty: None,
            state: CardState::Learning,
            interval_days: 1.0,
            due_date: Utc::now(),
            last_review: None,
            review_count: 0,
            lapses: 0,
        }
    }

    #[test]
    fn test_again_demotes_box() {
        let s = LeitnerStrategy::new();
        let result = s.schedule(&card(3), Rating::Again);
        assert_eq!(result.algorithm_state["box_number"], 2);
        assert_eq!(result.interval_days, 3.0);
        assert_eq!(result.state, "review");
    }

    #[test]
    fn test_good_advances_box() {
        let s = LeitnerStrategy::new();
        let result = s.schedule(&card(1), Rating::Good);
        assert_eq!(result.algorithm_state["box_number"], 2);
        assert_eq!(result.interval_days, 3.0);
        assert_eq!(result.state, "review");
    }

    #[test]
    fn test_easy_promotes_box() {
        let s = LeitnerStrategy::new();
        let result = s.schedule(&card(1), Rating::Easy);
        assert_eq!(result.algorithm_state["box_number"], 2);
        assert_eq!(result.interval_days, 3.0);
        assert_eq!(result.state, "review");
    }

    #[test]
    fn test_hard_stays_same_box() {
        let s = LeitnerStrategy::new();
        let result = s.schedule(&card(3), Rating::Hard);
        assert_eq!(result.algorithm_state["box_number"], 3);
        assert_eq!(result.interval_days, 7.0);
    }

    #[test]
    fn test_good_caps_at_box_5() {
        let s = LeitnerStrategy::new();
        let result = s.schedule(&card(5), Rating::Good);
        assert_eq!(result.algorithm_state["box_number"], 5);
        assert_eq!(result.interval_days, 30.0);
        assert_eq!(result.state, "review");
    }

    #[test]
    fn test_new_card_rated_good() {
        let s = LeitnerStrategy::new();
        // Uninitialized card: box_number = None → defaults to 0
        let c = CardProgress {
            card_id: "c1".into(),
            algorithm: Algorithm::Leitner,
            box_number: None,
            easiness_factor: None,
            repetitions: None,
            stability: None,
            difficulty: None,
            state: CardState::New,
            interval_days: 0.0,
            due_date: Utc::now(),
            last_review: None,
            review_count: 0,
            lapses: 0,
        };
        let result = s.schedule(&c, Rating::Good);
        assert_eq!(result.algorithm_state["box_number"], 1);
        assert_eq!(result.state, "learning");
    }

    #[test]
    fn test_initial_intervals() {
        let s = LeitnerStrategy::new();
        assert_eq!(s.initial_intervals(), vec![1.0, 3.0, 7.0, 14.0, 30.0]);
    }

    #[test]
    fn test_algorithm_name() {
        assert_eq!(LeitnerStrategy::new().algorithm_name(), "leitner");
    }
}
