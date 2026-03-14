use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingSession {
    pub id: String,
    pub title: String,
    pub language: String,
    pub task_type: String,
    pub prompt_text: Option<String>,
    pub original_text: String,
    pub corrected_text: Option<String>,
    pub word_count: i64,
    pub target_words: Option<i64>,
    pub time_limit_min: Option<i64>,
    pub elapsed_seconds: i64,
    pub status: String,
    pub overall_score: Option<f64>,
    pub grammar_score: Option<f64>,
    pub vocabulary_score: Option<f64>,
    pub coherence_score: Option<f64>,
    pub task_score: Option<f64>,
    pub band_score: Option<String>,
    pub feedback_json: String,
    pub corrections_json: String,
    pub grammar_patterns_json: String,
    pub cefr_level: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub submitted_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingCorrection {
    pub id: String,
    pub session_id: String,
    pub original_span: String,
    pub corrected_span: String,
    pub error_type: String,
    pub explanation: Option<String>,
    pub start_offset: i64,
    pub end_offset: i64,
    pub severity: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingPrompt {
    pub id: String,
    pub task_type: String,
    pub language: String,
    pub title: String,
    pub description: String,
    pub target_words: Option<i64>,
    pub time_limit_min: Option<i64>,
    pub cefr_level: Option<String>,
    pub is_builtin: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingStats {
    pub id: String,
    pub language: String,
    pub total_sessions: i64,
    pub total_words_written: i64,
    pub average_score: f64,
    pub best_score: f64,
    pub total_corrections: i64,
    pub common_errors_json: String,
    pub updated_at: String,
}
