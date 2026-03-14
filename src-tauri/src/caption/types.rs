use serde::{Deserialize, Serialize};

// ── Audio Device ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub sample_rate: u32,
    pub channels: u16,
}

// ── Caption Session / Segment (IPC) ──────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptionSession {
    pub id: String,
    pub language: String,
    pub source_type: String,
    pub source_file: Option<String>,
    pub device_name: Option<String>,
    pub whisper_model: String,
    pub duration_seconds: i64,
    pub segment_count: i64,
    pub word_count: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptionSegment {
    pub id: String,
    pub session_id: String,
    pub text: String,
    pub language: String,
    pub confidence: f64,
    pub start_time_ms: i64,
    pub end_time_ms: i64,
    pub word_timestamps: Vec<WordTimestamp>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordTimestamp {
    pub word: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub confidence: f64,
}

// ── Caption Engine State ─────────────────────────────────

pub struct CaptionEngineState {
    /// Recording handle (used for both batch recording and live archival WAV)
    pub recording: Option<super::audio::RecordingHandle>,
    pub is_transcribing: bool,
    pub active_session_id: Option<String>,
    pub recording_path: Option<std::path::PathBuf>,
    /// Whether a live capture is in progress
    pub is_live_capturing: bool,
}

impl CaptionEngineState {
    pub fn new() -> Self {
        Self {
            recording: None,
            is_transcribing: false,
            active_session_id: None,
            recording_path: None,
            is_live_capturing: false,
        }
    }

    pub fn is_capturing(&self) -> bool {
        self.recording.is_some()
    }

    pub fn is_live(&self) -> bool {
        self.is_live_capturing
    }
}

// ── Whisper Info ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperInfo {
    pub is_available: bool,
    pub binary_path: Option<String>,
    pub model_path: Option<String>,
    pub model_name: Option<String>,
}

// ── Caption Status ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptionStatus {
    pub is_capturing: bool,
    pub is_live_capturing: bool,
    pub is_transcribing: bool,
    pub active_session_id: Option<String>,
    pub device_name: Option<String>,
}

// ── Transcription Result ─────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub session: CaptionSession,
    pub segments: Vec<CaptionSegment>,
}

// ── Available Model Info ─────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableModel {
    pub id: String,
    pub name: String,
    pub size_mb: u64,
    pub description: String,
    pub is_english_only: bool,
    pub is_downloaded: bool,
    pub local_path: Option<String>,
    pub speed: String,
    pub accuracy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f64,
}

// ── Model Compatibility Check ────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelCompatibility {
    pub is_compatible: bool,
    pub current_model: Option<String>,
    pub suggested_models: Vec<AvailableModel>,
}

// ── Whisper Parsed Output ────────────────────────────────

#[derive(Debug, Clone)]
pub struct ParsedSegment {
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub confidence: f64,
    pub language: String,
    pub words: Vec<WordTimestamp>,
}
