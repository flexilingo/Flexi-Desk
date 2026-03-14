use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodcastFeed {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub feed_url: String,
    pub website_url: Option<String>,
    pub artwork_url: Option<String>,
    pub language: String,
    pub category: Option<String>,
    pub episode_count: i64,
    pub last_refreshed: Option<String>,
    pub is_subscribed: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodcastEpisode {
    pub id: String,
    pub feed_id: String,
    pub guid: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub audio_url: String,
    pub duration_seconds: i64,
    pub published_at: Option<String>,
    pub file_size: Option<i64>,
    pub is_downloaded: bool,
    pub local_path: Option<String>,
    pub play_position: i64,
    pub is_played: bool,
    pub transcript: Option<String>,
    pub transcript_status: String,
    pub cefr_level: Option<String>,
    pub word_count: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodcastBookmark {
    pub id: String,
    pub episode_id: String,
    pub position_ms: i64,
    pub label: Option<String>,
    pub note: Option<String>,
    pub created_at: String,
}

// ── iTunes Search Result ────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ITunesSearchResult {
    pub title: String,
    pub author: String,
    pub feed_url: String,
    pub artwork_url: String,
    pub genre: String,
}

// ── Parsed Feed (from RSS XML) ──────────────────────────

#[derive(Debug, Clone)]
pub struct ParsedFeed {
    pub title: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub website_url: Option<String>,
    pub artwork_url: Option<String>,
    pub language: Option<String>,
    pub category: Option<String>,
    pub episodes: Vec<ParsedEpisode>,
}

#[derive(Debug, Clone)]
pub struct ParsedEpisode {
    pub guid: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub audio_url: String,
    pub duration_seconds: i64,
    pub published_at: Option<String>,
    pub file_size: Option<i64>,
}

// ── Episode Download Progress ──────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeDownloadProgress {
    pub episode_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f64,
}

// ── Podcast Transcript Segment ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodcastTranscriptSegment {
    pub id: String,
    pub episode_id: String,
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub confidence: f64,
    pub language: String,
    pub words: Vec<PodcastWordTimestamp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodcastWordTimestamp {
    pub word: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub confidence: f64,
}

// ── Translation Result ─────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationResult {
    pub word: String,
    pub translation: String,
    pub source_lang: String,
    pub target_lang: String,
    pub alternatives: Vec<TranslationAlternative>,
    pub examples: Vec<String>,
    pub cefr_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationAlternative {
    pub pos: String,
    pub words: Vec<String>,
}

// ── Sync Point ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPoint {
    pub id: i64,
    pub episode_id: String,
    pub audio_time: f64,
    pub subtitle_time: f64,
}

// ── NLP Analysis ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NlpAnalysis {
    pub id: String,
    pub episode_id: String,
    pub total_words: i64,
    pub unique_words: i64,
    pub cefr_level: Option<String>,
    pub cefr_distribution: Option<String>,
    pub avg_sentence_length: f64,
    pub vocabulary_richness: f64,
    pub top_words: Option<String>,
    pub created_at: String,
}
