// =============================================================================
// Study engine — shared types (local reimplementation of practice-session)
// =============================================================================
// Ported from flexi-lingo-core/functions/practice-session/types.ts. Field names
// mirror the front's `store/practiceSessionApi.ts` so the desk frontend can
// consume the same shapes. Single-user local DB → `user_id` is a constant.
// =============================================================================

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Enums ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityType {
    Recall,
    Cloze,
    TypeTest,
    ListenAgain,
    SpeakTest,
    UseInSentence,
    SynonymDiscrim,
    MiniReading,
}

impl ActivityType {
    /// The primary proficiency dimension this activity trains.
    pub fn dimension(self) -> ProficiencyDimension {
        use ActivityType as A;
        use ProficiencyDimension as D;
        match self {
            A::Recall => D::Recognition,
            A::Cloze => D::Production,
            A::TypeTest => D::Recall,
            A::ListenAgain => D::Listening,
            A::SpeakTest => D::Pronunciation,
            A::UseInSentence => D::Production,
            // synonym_discrim & mini_reading are recognition tasks (see core note).
            A::SynonymDiscrim => D::Recognition,
            A::MiniReading => D::Recognition,
        }
    }

    /// Dimensions that also drift lightly on this activity.
    pub fn secondary_dimensions(self) -> Vec<ProficiencyDimension> {
        use ActivityType as A;
        use ProficiencyDimension as D;
        match self {
            A::Recall => vec![D::Recall],
            A::Cloze => vec![D::Recall, D::Recognition],
            A::TypeTest => vec![D::Production],
            A::ListenAgain => vec![D::Recognition],
            A::SpeakTest => vec![D::Production],
            A::UseInSentence => vec![D::Recall, D::Recognition],
            A::SynonymDiscrim => vec![D::Recall],
            A::MiniReading => vec![D::Recall],
        }
    }

    /// Approximate seconds an activity takes, for sizing the daily plan.
    pub fn est_seconds(self) -> f64 {
        use ActivityType::*;
        match self {
            Recall => 8.0,
            Cloze => 18.0,
            TypeTest => 20.0,
            ListenAgain => 12.0,
            SpeakTest => 25.0,
            UseInSentence => 60.0,
            SynonymDiscrim => 22.0,
            MiniReading => 90.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProficiencyDimension {
    Recognition,
    Recall,
    Listening,
    Production,
    Pronunciation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LearningStage {
    New,
    Learning,
    Reinforcing,
    Solidifying,
    Mature,
    Leech,
}

impl LearningStage {
    pub fn as_str(self) -> &'static str {
        use LearningStage::*;
        match self {
            New => "new",
            Learning => "learning",
            Reinforcing => "reinforcing",
            Solidifying => "solidifying",
            Mature => "mature",
            Leech => "leech",
        }
    }

    pub fn from_str_lenient(s: &str) -> LearningStage {
        use LearningStage::*;
        match s {
            "learning" => Learning,
            "reinforcing" => Reinforcing,
            "solidifying" => Solidifying,
            "mature" => Mature,
            "leech" => Leech,
            _ => New,
        }
    }
}

// ─── Stage rules ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StageRule {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub force_activities: Option<Vec<ActivityType>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefer_activities: Option<Vec<ActivityType>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub boost: Option<f64>,
}

pub type StageOverrides = HashMap<LearningStage, StageRule>;

// ─── Config ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PracticeConfig {
    /// Constant "local" — kept for shape-parity with the front's cloud config.
    pub user_id: String,
    pub preset: String,
    pub enabled_activities: Vec<ActivityType>,
    pub activity_weights: HashMap<ActivityType, f64>,
    pub stage_overrides: StageOverrides,
    pub daily_minutes: i64,
    pub goal: String,
    pub always_show_translation: bool,
    pub auto_pronounce: bool,
    pub reverse_card: bool,
    pub use_listen_again: bool,
    pub use_ai_grading: bool,
    pub deck_strategy: DeckStrategy,
    pub deck_weights: HashMap<String, f64>,
    pub active_deck_id: Option<String>,
    pub focus: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeckStrategy {
    Mix,
    Isolated,
    Rotation,
}

impl DeckStrategy {
    pub fn from_str_lenient(s: &str) -> DeckStrategy {
        match s {
            "isolated" => DeckStrategy::Isolated,
            "rotation" => DeckStrategy::Rotation,
            _ => DeckStrategy::Mix,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            DeckStrategy::Mix => "mix",
            DeckStrategy::Isolated => "isolated",
            DeckStrategy::Rotation => "rotation",
        }
    }
}

// ─── Proficiency ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardProficiency {
    #[serde(default)]
    pub card_id: String,
    #[serde(default)]
    pub deck_id: String,
    pub recognition_score: f64,
    pub recall_score: f64,
    pub listening_score: f64,
    pub production_score: f64,
    pub pronunciation_score: f64,
    pub learning_stage: LearningStage,
    pub consecutive_failures: i64,
    pub total_attempts: i64,
    #[serde(default)]
    pub last_practiced_at: Option<String>,
}

impl CardProficiency {
    pub fn new(card_id: &str, deck_id: &str) -> CardProficiency {
        CardProficiency {
            card_id: card_id.to_string(),
            deck_id: deck_id.to_string(),
            recognition_score: 0.0,
            recall_score: 0.0,
            listening_score: 0.0,
            production_score: 0.0,
            pronunciation_score: 0.0,
            learning_stage: LearningStage::New,
            consecutive_failures: 0,
            total_attempts: 0,
            last_practiced_at: None,
        }
    }

    pub fn score_for(&self, d: ProficiencyDimension) -> f64 {
        use ProficiencyDimension::*;
        match d {
            Recognition => self.recognition_score,
            Recall => self.recall_score,
            Listening => self.listening_score,
            Production => self.production_score,
            Pronunciation => self.pronunciation_score,
        }
    }

    pub fn set_score(&mut self, d: ProficiencyDimension, v: f64) {
        use ProficiencyDimension::*;
        match d {
            Recognition => self.recognition_score = v,
            Recall => self.recall_score = v,
            Listening => self.listening_score = v,
            Production => self.production_score = v,
            Pronunciation => self.pronunciation_score = v,
        }
    }

    pub fn avg(&self) -> f64 {
        (self.recognition_score
            + self.recall_score
            + self.listening_score
            + self.production_score
            + self.pronunciation_score)
            / 5.0
    }
}

// ─── Plan items ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanItem {
    pub card_id: String,
    pub deck_id: String,
    pub activity_type: ActivityType,
    pub order_index: i64,
    pub primary_dimension: ProficiencyDimension,
}

// ─── Activity prompt payloads ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ActivityPromptPayload {
    Recall {
        front_text: String,
        back_text: String,
        reverse: bool,
    },
    Cloze {
        sentence: String,
        target: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fa_translation: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        distractors: Option<Vec<String>>,
    },
    TypeTest {
        prompt_text: String,
        target: String,
        reverse: bool,
    },
    ListenAgain {
        audio_clip_url: String,
        source_type: String,
        source_snippet: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        source_position: Option<i64>,
    },
    SpeakTest {
        target: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        expected_phonemes: Option<String>,
    },
    UseInSentence {
        target: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        topic_hint: Option<String>,
    },
    SynonymDiscrim {
        context_sentence: String,
        options: Vec<String>,
        correct_index: i64,
    },
    MiniReading {
        paragraph: String,
        target_words: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        comprehension_question: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        comprehension_choices: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        comprehension_correct_index: Option<i64>,
    },
}

// ─── Card meta (from deck_cards + decks) ─────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CardMeta {
    pub id: String,
    pub front_text: String,
    pub back_text: String,
    pub deck_id: String,
    pub deck_title: String,
    /// Parsed notes JSON (definition/examples/synonyms/…), if any.
    pub notes: Option<serde_json::Value>,
}
