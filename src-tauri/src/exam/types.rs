use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamSession {
    pub id: String,
    pub exam_type: String,
    pub title: String,
    pub language: String,
    pub status: String,
    pub total_sections: i64,
    pub current_section: i64,
    pub total_questions: i64,
    pub answered_count: i64,
    pub correct_count: i64,
    pub overall_score: Option<f64>,
    pub band_score: Option<String>,
    pub time_limit_min: Option<i64>,
    pub elapsed_seconds: i64,
    pub sections_json: String,
    pub results_json: String,
    pub feedback_json: String,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamQuestion {
    pub id: String,
    pub session_id: String,
    pub section_index: i64,
    pub question_index: i64,
    pub question_type: String,
    pub prompt: String,
    pub context_text: Option<String>,
    pub audio_url: Option<String>,
    pub image_url: Option<String>,
    pub options_json: String,
    pub correct_answer: Option<String>,
    pub user_answer: Option<String>,
    pub is_correct: Option<bool>,
    pub score: Option<f64>,
    pub max_score: f64,
    pub feedback: Option<String>,
    pub time_spent_sec: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamTemplate {
    pub id: String,
    pub exam_type: String,
    pub title: String,
    pub description: Option<String>,
    pub language: String,
    pub sections_json: String,
    pub time_limit_min: Option<i64>,
    pub total_questions: i64,
    pub cefr_level: Option<String>,
    pub is_builtin: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamHistory {
    pub id: String,
    pub exam_type: String,
    pub language: String,
    pub total_attempts: i64,
    pub best_score: f64,
    pub average_score: f64,
    pub best_band: Option<String>,
    pub last_attempt_at: Option<String>,
    pub updated_at: String,
}
