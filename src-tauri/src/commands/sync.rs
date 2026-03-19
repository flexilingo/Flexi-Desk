use tauri::State;

use crate::sync::types::*;
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

#[tauri::command]
pub fn sync_get_status(state: State<'_, AppState>) -> Result<SyncState, String> {
    let conn = lock_db(&state)?;
    crate::sync::engine::get_sync_state(&conn)
}

#[tauri::command]
pub fn sync_get_config(state: State<'_, AppState>) -> Result<Vec<SyncMetadata>, String> {
    let conn = lock_db(&state)?;
    crate::sync::engine::get_sync_config(&conn)
}

#[tauri::command]
pub fn sync_set_table_enabled(
    state: State<'_, AppState>,
    table_name: String,
    enabled: bool,
    direction: Option<String>,
) -> Result<SyncMetadata, String> {
    let conn = lock_db(&state)?;
    crate::sync::engine::set_table_enabled(&conn, &table_name, enabled, direction.as_deref())
}

#[tauri::command]
pub fn sync_get_queue(
    state: State<'_, AppState>,
    status: Option<String>,
) -> Result<Vec<SyncQueueEntry>, String> {
    let conn = lock_db(&state)?;
    crate::sync::queue::get_pending(&conn, status.as_deref())
}

#[tauri::command]
pub fn sync_get_conflicts(state: State<'_, AppState>) -> Result<Vec<SyncConflict>, String> {
    let conn = lock_db(&state)?;
    crate::sync::engine::get_conflicts(&conn)
}

#[tauri::command]
pub fn sync_resolve_conflict(
    state: State<'_, AppState>,
    conflict_id: String,
    resolution: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    crate::sync::engine::resolve_conflict(&conn, &conflict_id, &resolution)
}

#[tauri::command]
pub fn sync_enqueue_change(
    state: State<'_, AppState>,
    table_name: String,
    row_id: String,
    operation: String,
    payload: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    crate::sync::queue::enqueue(&conn, &table_name, &row_id, &operation, &payload)
}
