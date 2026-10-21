// =============================================================================
// Study engine — config defaults & presets (ported from types.ts + config-service.ts)
// =============================================================================

use super::types::*;
use std::collections::HashMap;

/// The single-user sentinel that stands in for the cloud `user_id`.
pub const LOCAL_USER: &str = "local";

pub fn preset_activities(preset: &str) -> Vec<ActivityType> {
    use ActivityType::*;
    match preset {
        "vocabulary" => vec![Recall, Cloze, TypeTest],
        "listening" => vec![ListenAgain, Recall, Cloze],
        "speaking" => vec![SpeakTest, UseInSentence, Recall],
        "full" => vec![
            Recall,
            Cloze,
            TypeTest,
            ListenAgain,
            SpeakTest,
            UseInSentence,
            SynonymDiscrim,
            MiniReading,
        ],
        _ => vec![], // custom
    }
}

pub fn preset_weights(preset: &str) -> HashMap<ActivityType, f64> {
    use ActivityType::*;
    let mut m = HashMap::new();
    match preset {
        "vocabulary" => {
            m.insert(Recall, 0.40);
            m.insert(Cloze, 0.35);
            m.insert(TypeTest, 0.25);
        }
        "listening" => {
            m.insert(ListenAgain, 0.50);
            m.insert(Recall, 0.30);
            m.insert(Cloze, 0.20);
        }
        "speaking" => {
            m.insert(SpeakTest, 0.40);
            m.insert(UseInSentence, 0.40);
            m.insert(Recall, 0.20);
        }
        "full" => {
            m.insert(Recall, 0.18);
            m.insert(Cloze, 0.18);
            m.insert(TypeTest, 0.12);
            m.insert(ListenAgain, 0.12);
            m.insert(SpeakTest, 0.10);
            m.insert(UseInSentence, 0.15);
            m.insert(SynonymDiscrim, 0.08);
            m.insert(MiniReading, 0.07);
        }
        _ => {}
    }
    m
}

/// DEFAULT_STAGE_OVERRIDES from types.ts.
pub fn default_stage_overrides() -> StageOverrides {
    use ActivityType::*;
    let mut m: StageOverrides = HashMap::new();
    m.insert(
        LearningStage::New,
        StageRule {
            force_activities: Some(vec![Recall]),
            prefer_activities: None,
            boost: None,
        },
    );
    m.insert(
        LearningStage::Leech,
        StageRule {
            force_activities: Some(vec![ListenAgain, Recall]),
            prefer_activities: None,
            boost: None,
        },
    );
    m.insert(
        LearningStage::Mature,
        StageRule {
            force_activities: None,
            prefer_activities: Some(vec![UseInSentence, MiniReading, SynonymDiscrim]),
            boost: Some(1.5),
        },
    );
    m
}

/// Fresh default config (matches buildDefaultConfig in config-service.ts).
pub fn build_default_config(now: &str) -> PracticeConfig {
    let preset = "vocabulary";
    PracticeConfig {
        user_id: LOCAL_USER.to_string(),
        preset: preset.to_string(),
        enabled_activities: preset_activities(preset),
        activity_weights: preset_weights(preset),
        stage_overrides: default_stage_overrides(),
        daily_minutes: 20,
        goal: "maintenance".to_string(),
        always_show_translation: false,
        auto_pronounce: true,
        reverse_card: false,
        use_listen_again: true,
        use_ai_grading: true,
        deck_strategy: DeckStrategy::Mix,
        deck_weights: HashMap::new(),
        active_deck_id: None,
        focus: None,
        created_at: now.to_string(),
        updated_at: now.to_string(),
    }
}
