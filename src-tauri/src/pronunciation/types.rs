use serde::{Deserialize, Serialize};

// ── Practice Mode ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PronunciationSession {
    pub id: String,
    pub mode: String,
    pub language: String,
    pub target_text: String,
    pub reference_audio: Option<String>,
    pub status: String,
    pub overall_score: Option<f64>,
    pub phoneme_score: Option<f64>,
    pub prosody_score: Option<f64>,
    pub fluency_score: Option<f64>,
    pub feedback_json: String,
    pub attempts: i64,
    pub best_score: Option<f64>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PronunciationAttempt {
    pub id: String,
    pub session_id: String,
    pub attempt_number: i64,
    pub audio_path: String,
    pub duration_ms: i64,
    pub transcript: Option<String>,
    pub overall_score: Option<f64>,
    pub phoneme_score: Option<f64>,
    pub prosody_score: Option<f64>,
    pub fluency_score: Option<f64>,
    pub word_scores_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PronunciationProgress {
    pub id: String,
    pub language: String,
    pub total_sessions: i64,
    pub total_attempts: i64,
    pub average_score: f64,
    pub best_score: f64,
    pub practice_minutes: i64,
    pub weak_phonemes: String,
    pub updated_at: String,
}

// ── Analysis Result ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub transcript: String,
    pub overall_score: f64,
    pub phoneme_score: f64,
    pub prosody_score: f64,
    pub fluency_score: f64,
    pub word_scores: Vec<WordScore>,
    pub feedback: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordScore {
    pub expected: String,
    pub actual: String,
    pub score: f64,
    pub status: String, // "correct", "substitution", "missing", "extra"
}
