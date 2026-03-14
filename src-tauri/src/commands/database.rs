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
