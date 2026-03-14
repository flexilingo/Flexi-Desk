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
}

#[derive(Debug, Clone)]
pub enum AlgorithmState {
    Leitner { box_number: i32 },
    SM2 { easiness_factor: f64, repetitions: i32 },
    FSRS { stability: f64, difficulty: f64 },
}