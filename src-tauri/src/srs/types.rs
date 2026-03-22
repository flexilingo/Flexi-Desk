use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Algorithm {
    Leitner,
    #[serde(rename = "sm2")]
    SM2,
    #[serde(rename = "fsrs")]
    FSRS,
}

impl Algorithm {
    pub fn as_str(&self) -> &'static str {
        match self {
            Algorithm::Leitner => "leitner",
            Algorithm::SM2 => "sm2",
            Algorithm::FSRS => "fsrs",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "leitner" => Ok(Algorithm::Leitner),
            "sm2" => Ok(Algorithm::SM2),
            "fsrs" => Ok(Algorithm::FSRS),
            _ => Err(format!("Unknown algorithm: {s}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Rating {
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4,
}

impl Rating {
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "again" => Ok(Rating::Again),
            "hard" => Ok(Rating::Hard),
            "good" => Ok(Rating::Good),
            "easy" => Ok(Rating::Easy),
            _ => Err(format!("Unknown rating: {s}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardState {
    New,
    Learning,
    Review,
    Relearning,
}

impl CardState {
    pub fn as_str(&self) -> &'static str {
        match self {
            CardState::New => "new",
            CardState::Learning => "learning",
            CardState::Review => "review",
            CardState::Relearning => "relearning",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "new" => Ok(CardState::New),
            "learning" => Ok(CardState::Learning),
            "review" => Ok(CardState::Review),
            "relearning" => Ok(CardState::Relearning),
            _ => Err(format!("Unknown card state: {s}")),
        }
    }
}

#[derive(Debug, Clone)]
pub struct CardProgress {
    pub card_id: String,
    pub algorithm: Algorithm,
    pub box_number: Option<i32>,
    pub easiness_factor: Option<f64>,
    pub repetitions: Option<i32>,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub state: CardState,
    pub interval_days: f64,
    pub due_date: DateTime<Utc>,
    pub last_review: Option<DateTime<Utc>>,
    pub review_count: i32,
    pub lapses: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleResult {
    pub interval_days: f64,
    pub due_date: String,
    pub state: String,
    pub algorithm_state: serde_json::Value,
    #[serde(default)]
    pub should_requeue: bool,
    #[serde(default)]
    pub was_correct: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_algorithm_as_str() {
        assert_eq!(Algorithm::Leitner.as_str(), "leitner");
        assert_eq!(Algorithm::SM2.as_str(), "sm2");
        assert_eq!(Algorithm::FSRS.as_str(), "fsrs");
    }

    #[test]
    fn test_algorithm_from_str_valid() {
        assert_eq!(Algorithm::from_str("leitner").unwrap(), Algorithm::Leitner);
        assert_eq!(Algorithm::from_str("sm2").unwrap(), Algorithm::SM2);
        assert_eq!(Algorithm::from_str("fsrs").unwrap(), Algorithm::FSRS);
    }

    #[test]
    fn test_algorithm_from_str_invalid() {
        assert!(Algorithm::from_str("unknown").is_err());
        assert!(Algorithm::from_str("").is_err());
        assert!(Algorithm::from_str("SM2").is_err()); // case-sensitive
    }

    #[test]
    fn test_rating_from_str_all_valid() {
        assert_eq!(Rating::from_str("again").unwrap(), Rating::Again);
        assert_eq!(Rating::from_str("hard").unwrap(), Rating::Hard);
        assert_eq!(Rating::from_str("good").unwrap(), Rating::Good);
        assert_eq!(Rating::from_str("easy").unwrap(), Rating::Easy);
    }

    #[test]
    fn test_rating_from_str_invalid() {
        assert!(Rating::from_str("perfect").is_err());
        assert!(Rating::from_str("Good").is_err()); // case-sensitive
        assert!(Rating::from_str("").is_err());
    }

    #[test]
    fn test_rating_discriminant_values() {
        assert_eq!(Rating::Again as i32, 1);
        assert_eq!(Rating::Hard as i32, 2);
        assert_eq!(Rating::Good as i32, 3);
        assert_eq!(Rating::Easy as i32, 4);
    }

    #[test]
    fn test_card_state_as_str() {
        assert_eq!(CardState::New.as_str(), "new");
        assert_eq!(CardState::Learning.as_str(), "learning");
        assert_eq!(CardState::Review.as_str(), "review");
        assert_eq!(CardState::Relearning.as_str(), "relearning");
    }

    #[test]
    fn test_card_state_from_str_all_valid() {
        assert_eq!(CardState::from_str("new").unwrap(), CardState::New);
        assert_eq!(CardState::from_str("learning").unwrap(), CardState::Learning);
        assert_eq!(CardState::from_str("review").unwrap(), CardState::Review);
        assert_eq!(CardState::from_str("relearning").unwrap(), CardState::Relearning);
    }

    #[test]
    fn test_card_state_from_str_invalid() {
        assert!(CardState::from_str("graduated").is_err());
        assert!(CardState::from_str("").is_err());
        assert!(CardState::from_str("Review").is_err()); // case-sensitive
    }
}

#[derive(Debug, Clone)]
pub enum AlgorithmState {
    Leitner { box_number: i32 },
    SM2 { easiness_factor: f64, repetitions: i32 },
    FSRS { stability: f64, difficulty: f64 },
}