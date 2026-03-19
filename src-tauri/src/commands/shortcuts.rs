use tauri::State;

use crate::shortcuts::types::{KeyboardShortcut, ShortcutConflict};
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

#[tauri::command]
pub fn shortcut_list(
    state: State<'_, AppState>,
    category: Option<String>,
) -> Result<Vec<KeyboardShortcut>, String> {
    let conn = lock_db(&state)?;
    crate::shortcuts::list_shortcuts(&conn, category.as_deref())
}

#[tauri::command]
pub fn shortcut_update_binding(
    state: State<'_, AppState>,
    action_id: String,
    new_binding: String,
) -> Result<KeyboardShortcut, String> {
    let conn = lock_db(&state)?;
    crate::shortcuts::update_binding(&conn, &action_id, &new_binding)
}

#[tauri::command]
pub fn shortcut_check_conflict(
    state: State<'_, AppState>,
    action_id: String,
    binding: String,
) -> Result<Option<ShortcutConflict>, String> {
    let conn = lock_db(&state)?;
    crate::shortcuts::check_conflict(&conn, &action_id, &binding)
}

#[tauri::command]
pub fn shortcut_reset(
    state: State<'_, AppState>,
    action_id: String,
) -> Result<KeyboardShortcut, String> {
    let conn = lock_db(&state)?;
    crate::shortcuts::reset_shortcut(&conn, &action_id)
}

#[tauri::command]
pub fn shortcut_reset_all(
    state: State<'_, AppState>,
) -> Result<Vec<KeyboardShortcut>, String> {
    let conn = lock_db(&state)?;
    crate::shortcuts::reset_all(&conn)
}

#[tauri::command]
pub fn shortcut_toggle(
    state: State<'_, AppState>,
    action_id: String,
    enabled: bool,
) -> Result<KeyboardShortcut, String> {
    let conn = lock_db(&state)?;
    crate::shortcuts::toggle_shortcut(&conn, &action_id, enabled)
}
