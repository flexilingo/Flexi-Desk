use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncQueueEntry {
    pub id: String,
    pub table_name: String,
    pub row_id: String,
    pub operation: String,
    pub payload: String,
    pub status: String,
    pub retry_count: i64,
    pub error_message: Option<String>,
    pub created_at: String,
    pub synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncMetadata {
    pub table_name: String,
    pub last_synced_at: Option<String>,
    pub last_cursor: Option<String>,
    pub is_enabled: bool,
    pub record_count: i64,
    pub sync_direction: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConflict {
    pub id: String,
    pub table_name: String,
    pub row_id: String,
    pub local_data: String,
    pub remote_data: String,
    pub local_updated: String,
    pub remote_updated: String,
    pub status: String,
    pub created_at: String,
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum SyncStatus {
    Idle,
    Syncing,
    Synced,
    Offline,
    Error,
    Conflict,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncState {
    pub status: SyncStatus,
    pub last_synced_at: Option<String>,
    pub pending_count: i64,
    pub conflict_count: i64,
    pub error_message: Option<String>,
}

pub const SYNCABLE_TABLES: &[&str] = &[
    "vocabulary",
    "decks",
    "deck_cards",
    "srs_progress",
    "goals",
    "daily_stats",
    "streaks",
    "settings",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushRequest {
    pub table_name: String,
    pub changes: Vec<SyncChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncChange {
    pub operation: String,
    pub row_id: String,
    pub data: serde_json::Value,
    pub updated_at: String,
}
