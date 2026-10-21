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
    // ── Cloud identity + v2 difficulty aggregate (V028) ──
    /// PodcastIndex feed id, set when this feed came from the cloud catalog.
    pub remote_feed_id: Option<i64>,
    pub difficulty_band_low: Option<String>,
    pub difficulty_band_high: Option<String>,
    pub difficulty_score_median: Option<i64>,
    pub difficulty_episodes_scored: Option<i64>,
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
    /// Legacy v1 per-feed level. Superseded by `difficulty_band` for scored episodes.
    pub cefr_level: Option<String>,
    pub word_count: Option<i64>,
    pub created_at: String,
    // ── Cloud identity + v2 per-episode difficulty (V028) ──
    /// `podcast_{feed}_ep_{ep}` — addresses this episode in `?action=get-episode`.
    pub video_id: Option<String>,
    /// `curated_episodes.id` UUID — required by `?action=update-episode-activity`.
    /// NULL for PodcastIndex-only episodes, which skip the cloud heartbeat.
    pub curated_episode_id: Option<String>,
    pub difficulty_band: Option<String>,
    pub difficulty_score: Option<i64>,
    pub difficulty_range_low: Option<String>,
    pub difficulty_range_high: Option<String>,
    pub difficulty_confidence: Option<String>,
    pub difficulty_lang: Option<String>,
    pub speech_rate_wpm: Option<i64>,
    /// Which transcript the player shows: `local` (Whisper on this machine, with
    /// word-level timestamps) or `cloud` (FlexiLingo's, segment-level only).
    pub transcript_source: String,
    /// `unknown` until we've asked the cloud; then `ready` | `unavailable`.
    pub cloud_transcript_status: String,
    /// Episode artwork; falls back to the feed's cover in the UI.
    pub image_url: Option<String>,
    /// Language of the transcript this episode currently has — stamped when the
    /// transcript is created (local Whisper or cloud fetch). Authoritative for
    /// word-lookup source language; `difficulty_lang` and the feed's declared
    /// language are only fallbacks.
    pub transcript_lang: Option<String>,
}

/// Cloud episode metadata handed to `podcast_import_cloud_episode`, mirroring the
/// shapes returned by `?action=episodes-by-level` / `browse-episodes` / `get-episode`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudEpisodeInput {
    // Feed identity
    pub remote_feed_id: Option<i64>,
    pub feed_url: Option<String>,
    pub podcast_title: Option<String>,
    pub podcast_author: Option<String>,
    pub podcast_image_url: Option<String>,
    pub podcast_language: Option<String>,
    // Episode identity
    pub video_id: Option<String>,
    pub curated_episode_id: Option<String>,
    pub guid: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub audio_url: String,
    pub duration_seconds: Option<i64>,
    pub published_at: Option<String>,
    pub image_url: Option<String>,
    // v2 difficulty
    pub difficulty_band: Option<String>,
    pub difficulty_score: Option<i64>,
    pub difficulty_range_low: Option<String>,
    pub difficulty_range_high: Option<String>,
    pub difficulty_confidence: Option<String>,
    pub difficulty_lang: Option<String>,
    pub speech_rate_wpm: Option<i64>,
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
    /// `None` when the source language has no local frequency table — the UI hides
    /// the badge rather than showing a level computed against the wrong language.
    pub cefr_level: Option<String>,
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
