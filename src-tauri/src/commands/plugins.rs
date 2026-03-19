use tauri::State;

use crate::plugins::types::PluginInfo;
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

#[tauri::command]
pub fn plugin_list(state: State<'_, AppState>) -> Result<Vec<PluginInfo>, String> {
    let conn = lock_db(&state)?;
    crate::plugins::manager::list_plugins(&conn)
}

#[tauri::command]
pub fn plugin_enable(
    state: State<'_, AppState>,
    plugin_id: String,
) -> Result<PluginInfo, String> {
    let conn = lock_db(&state)?;
    crate::plugins::manager::enable_plugin(&conn, &plugin_id)
}

#[tauri::command]
pub fn plugin_disable(
    state: State<'_, AppState>,
    plugin_id: String,
) -> Result<PluginInfo, String> {
    let conn = lock_db(&state)?;
    crate::plugins::manager::disable_plugin(&conn, &plugin_id)
}

#[tauri::command]
pub fn plugin_uninstall(
    state: State<'_, AppState>,
    plugin_id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    crate::plugins::manager::uninstall_plugin(&conn, &plugin_id)
}

#[tauri::command]
pub fn plugin_update_config(
    state: State<'_, AppState>,
    plugin_id: String,
    config: serde_json::Value,
) -> Result<PluginInfo, String> {
    let conn = lock_db(&state)?;
    crate::plugins::manager::update_config(&conn, &plugin_id, &config)
}

#[tauri::command]
pub fn plugin_install_local(
    state: State<'_, AppState>,
    plugin_dir: String,
) -> Result<PluginInfo, String> {
    let dir = std::path::Path::new(&plugin_dir);
    let manifest = crate::plugins::manifest::parse_manifest(dir)?;
    let wasm_path = dir.join(&manifest.entry_point);

    let conn = lock_db(&state)?;
    crate::plugins::manager::register_plugin(
        &conn,
        &manifest,
        &wasm_path.to_string_lossy(),
        "local",
    )
}
