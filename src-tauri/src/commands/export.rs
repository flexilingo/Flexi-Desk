use tauri::State;

use crate::export::types::*;
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

#[tauri::command]
pub fn export_vocabulary_csv(
    state: State<'_, AppState>,
    file_path: String,
    options: ExportOptions,
) -> Result<ExportResult, String> {
    let conn = lock_db(&state)?;
    crate::export::csv_handler::export_csv(&conn, &file_path, &options)
}

#[tauri::command]
pub fn export_vocabulary_anki(
    state: State<'_, AppState>,
    file_path: String,
    options: ExportOptions,
) -> Result<ExportResult, String> {
    let conn = lock_db(&state)?;
    crate::export::anki::export_anki(&conn, &file_path, &options)
}

#[tauri::command]
pub fn import_preview_csv(
    file_path: String,
    delimiter: Option<String>,
) -> Result<ImportPreview, String> {
    crate::export::csv_handler::preview_csv(&file_path, delimiter.as_deref())
}

#[tauri::command]
pub fn export_deck_anki(
    state: State<'_, AppState>,
    file_path: String,
    deck_id: String,
) -> Result<ExportResult, String> {
    let conn = lock_db(&state)?;
    crate::export::anki::export_deck_anki(&conn, &file_path, &deck_id)
}

#[tauri::command]
pub fn import_execute(
    state: State<'_, AppState>,
    file_path: String,
    options: ImportOptions,
) -> Result<ImportResult, String> {
    let conn = lock_db(&state)?;
    match options.format {
        ImportFormat::Csv | ImportFormat::Tsv => {
            crate::export::csv_handler::import_csv(&conn, &file_path, &options)
        }
        ImportFormat::Anki => crate::export::anki::import_anki(
            &conn,
            &file_path,
            &options.target_language,
            options.skip_duplicates,
        ),
    }
}
