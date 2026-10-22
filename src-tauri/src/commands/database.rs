use std::collections::HashMap;

use rusqlite::OptionalExtension;
use tauri::State;

use crate::AppState;

#[derive(Debug, thiserror::Error)]
pub enum DatabaseError {
    #[error("Database lock error: {0}")]
    Lock(String),

    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

impl From<DatabaseError> for String {
    fn from(err: DatabaseError) -> String {
        err.to_string()
    }
}

#[tauri::command]
pub fn get_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| DatabaseError::Lock(e.to_string()))?;

    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(DatabaseError::from)?;

    let result = stmt
        .query_row(rusqlite::params![key], |row| row.get::<_, String>(0))
        .optional()
        .map_err(DatabaseError::from)?;

    Ok(result)
}

#[tauri::command]
pub fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    // These settings name programs / models the app later runs or loads; the webview may not
    // point them at an arbitrary path (use the dedicated command, which checks the dialog).
    if (key == "whisper_binary_path" || key == "whisper_model_path") && !value.trim().is_empty() {
        crate::commands::path_grants::require(&value)?;
    }
    let conn = state
        .db
        .lock()
        .map_err(|e| DatabaseError::Lock(e.to_string()))?;

    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        rusqlite::params![key, value],
    )
    .map_err(DatabaseError::from)?;

    // The AI time limit is read on every call: apply a change at once.
    if key == crate::ai::provider::AI_TIMEOUT_SETTING {
        crate::ai::provider::set_request_timeout_secs(crate::ai::provider::parse_timeout_setting(
            Some(&value),
        ));
    }

    Ok(())
}

#[tauri::command]
pub fn get_all_settings(
    state: State<'_, AppState>,
) -> Result<HashMap<String, String>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| DatabaseError::Lock(e.to_string()))?;

    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(DatabaseError::from)?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(DatabaseError::from)?;

    let mut settings = HashMap::new();
    for row in rows {
        let (key, value) = row.map_err(DatabaseError::from)?;
        settings.insert(key, value);
    }

    Ok(settings)
}
