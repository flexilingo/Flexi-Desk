use chrono::Utc;

use super::strategy::SRSStrategy;
use super::types::*;

const FACTOR: f64 = 19.0 / 81.0;
const DECAY: f64 = -0.5;

const INITIAL_STABILITY: [f64; 4] = [0.4, 0.6, 2.4, 5.8];
const INITIAL_DIFFICULTY: f64 = 4.93;
const DIFFICULTY_DECAY: f64 = 0.12;
const STABILITY_DECAY: f64 = 0.21;
const RETRIEVABILITY_GAIN: f64 = 2.0;
const DIFFICULTY_WEIGHT: f64 = 0.28;

pub struct FSRSStrategy {
    desired_retention: f64,
}

impl FSRSStrategy {
    pub fn new() -> Self {
        Self {
            desired_retention: 0.9,
        }
    }

    fn retrievability(&self, elapsed_days: f64, stability: f64) -> f64 {
        if stability <= 0.0 {
            return 0.0;
        }
        (1.0 + FACTOR * elapsed_days / stability).powf(DECAY)
    }

    fn next_interval(&self, stability: f64) -> f64 {
        let interval = (stability / FACTOR)
            * (self.desired_retention.powf(1.0 / DECAY) - 1.0);
        interval.max(1.0).round()
    }

    fn next_difficulty(difficulty: f64, rating: Rating) -> f64 {
        let grade = rating as i32 as f64;
        let new_d = difficulty - DIFFICULTY_WEIGHT * (grade - 3.0);
        new_d.clamp(1.0, 10.0)
    }

    fn next_stability(
        stability: f64,
        difficulty: f64,
        retrievability: f64,
        rating: Rating,
    ) -> f64 {
        match rating {
            Rating::Again => {
                let new_s = stability
                    * ((-0.5 * difficulty).exp())
                    * ((retrievability + 1.0).powf(0.2) - 1.0)
                    * 0.5;
                new_s.max(0.1)
            }
            _ => {
                let bonus = match rating {
                    Rating::Hard => 0.8,
                    Rating::Good => 1.0,
                    Rating::Easy => 1.3,
                    _ => 1.0,
                };
                stability
                    * (1.0
                        + DIFFICULTY_DECAY.exp()
                            * (11.0 - difficulty)
                            * stability.powf(-STABILITY_DECAY)
                            * (((1.0 - retrievability) * RETRIEVABILITY_GAIN).exp() - 1.0))
                    * bonus
            }
        }
    }
}

impl SRSStrategy for FSRSStrategy {
    fn schedule(&self, card: &CardProgress, rating: Rating) -> ScheduleResult {
        let (new_stability, new_difficulty, state) = match card.state {
            CardState::New => {
                let idx = ((rating as i32) - 1) as usize;
                let s = INITIAL_STABILITY[idx.min(3)];
                let d = INITIAL_DIFFICULTY;
                let state = if rating == Rating::Again {
                    CardState::Learning
                } else {
                    CardState::Review
                };
                (s, d, state)
            }
            CardState::Learning | CardState::Relearning => {
                let s = card.stability.unwrap_or(0.4);
                let d = card.difficulty.unwrap_or(INITIAL_DIFFICULTY);
                let state = if rating == Rating::Again {
                    CardState::Relearning
                } else {
                    CardState::Review
                };
                (s * 1.5, d, state)
            }
            CardState::Review => {
                let s = card.stability.unwrap_or(1.0);
                let d = card.difficulty.unwrap_or(INITIAL_DIFFICULTY);
                let elapsed = card
                    .last_review
                    .map(|lr| (Utc::now() - lr).num_seconds() as f64 / 86400.0)
                    .unwrap_or(card.interval_days);
                let r = self.retrievability(elapsed, s);
                let new_s = Self::next_stability(s, d, r, rating);
                let new_d = Self::next_difficulty(d, rating);
                let state = if rating == Rating::Again {
                    CardState::Relearning
                } else {
                    CardState::Review
                };
                (new_s, new_d, state)
            }
        };

        let interval = self.next_interval(new_stability);
        let due = Utc::now() + chrono::Duration::seconds((interval * 86400.0) as i64);

        ScheduleResult {
            interval_days: interval,
            due_date: due.to_rfc3339(),
            state: state.as_str().to_string(),
            algorithm_state: serde_json::json!({
                "stability": new_stability,
                "difficulty": new_difficulty,
            }),
        }
    }

    fn initial_intervals(&self) -> Vec<f64> {
        INITIAL_STABILITY
            .iter()
            .map(|s| self.next_interval(*s))
            .collect()
    }

    fn algorithm_name(&self) -> &'static str {
        "fsrs"
    }
}
