use tauri::State;

use crate::jobs::JobEvent;
use crate::AppState;

#[tauri::command]
pub async fn job_cancel(
    state: State<'_, AppState>,
    job_id: String,
) -> Result<(), String> {
    let registry = state.jobs.lock().await;
    if let Some(entry) = registry.get(&job_id) {
        entry.cancel_token.cancel();
        Ok(())
    } else {
        Err("Job not found".into())
    }
}

#[tauri::command]
pub async fn job_list(
    state: State<'_, AppState>,
) -> Result<Vec<JobEvent>, String> {
    let registry = state.jobs.lock().await;
    Ok(registry.list_active())
}
