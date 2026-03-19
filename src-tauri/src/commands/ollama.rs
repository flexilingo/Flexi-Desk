use tauri::{AppHandle, Emitter, State};

use crate::ollama::client::OllamaClient;
use crate::ollama::installer;
use crate::ollama::types::{OllamaInstallStatus, OllamaModel, OllamaStatus};
use crate::AppState;

fn get_ollama_base_url(state: &State<'_, AppState>) -> String {
    let conn = state.db.lock().unwrap();
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'ollama_base_url'",
        [],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "http://localhost:11434".to_string())
}

#[tauri::command]
pub async fn ollama_status(state: State<'_, AppState>) -> Result<OllamaStatus, String> {
    let base_url = get_ollama_base_url(&state);
    let client = OllamaClient::new(Some(&base_url));
    Ok(client.status().await)
}

#[tauri::command]
pub async fn ollama_list_models(state: State<'_, AppState>) -> Result<Vec<OllamaModel>, String> {
    let base_url = get_ollama_base_url(&state);
    let client = OllamaClient::new(Some(&base_url));
    client.list_models().await
}

#[tauri::command]
pub async fn ollama_check_connection(state: State<'_, AppState>) -> Result<String, String> {
    let base_url = get_ollama_base_url(&state);
    let client = OllamaClient::new(Some(&base_url));
    client.health_check().await
}

#[tauri::command]
pub async fn ollama_pull_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_name: String,
) -> Result<(), String> {
    let base_url = get_ollama_base_url(&state);
    let client = OllamaClient::new(Some(&base_url));
    client
        .pull_model(&model_name, |progress| {
            let _ = app.emit("ollama-pull-progress", &progress);
        })
        .await
}

#[tauri::command]
pub async fn ollama_delete_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<(), String> {
    let base_url = get_ollama_base_url(&state);
    let client = OllamaClient::new(Some(&base_url));
    client.delete_model(&model_name).await
}

#[tauri::command]
pub async fn ollama_install_status(
    state: State<'_, AppState>,
) -> Result<OllamaInstallStatus, String> {
    let system_path = installer::detect_system_ollama();
    let managed_installed = installer::is_managed_ollama_installed();
    let managed_path = installer::ollama_binary_path()
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_string()));

    let is_installed = system_path.is_some() || managed_installed;
    let binary_path = system_path.clone().or_else(|| {
        if managed_installed {
            managed_path
        } else {
            None
        }
    });

    // Check if serve is running by trying a health check
    let base_url = get_ollama_base_url(&state);
    let is_serve_running = installer::wait_healthy(&base_url, 1).await;

    Ok(OllamaInstallStatus {
        is_installed,
        binary_path,
        is_managed: managed_installed && system_path.is_none(),
        is_system_install: system_path.is_some(),
        is_serve_running,
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    })
}

#[tauri::command]
pub async fn ollama_install(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let path = installer::download_ollama(&app).await?;

    // Save binary path to settings
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('ollama_binary_path', ?1)",
        [&path],
    )
    .map_err(|e| format!("Failed to save setting: {e}"))?;

    Ok(path)
}

#[tauri::command]
pub async fn ollama_start_serve(
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Find the binary
    let binary_path = installer::resolve_ollama_binary()
        .ok_or_else(|| "Ollama binary not found. Please install first.".to_string())?;

    // Check if already running
    let base_url = get_ollama_base_url(&state);
    if installer::wait_healthy(&base_url, 1).await {
        return Ok(()); // Already running
    }

    // Start the process
    let child = installer::start_serve(&binary_path)?;

    // Store in AppState
    {
        let mut proc = state.ollama_process.lock().await;
        *proc = Some(child);
    }

    // Wait for it to become healthy
    if !installer::wait_healthy(&base_url, 15).await {
        // Kill the process if it didn't start properly
        let mut proc = state.ollama_process.lock().await;
        if let Some(ref mut child) = *proc {
            installer::stop_serve(child);
        }
        *proc = None;
        return Err("Ollama serve started but failed to become healthy within 15 seconds".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn ollama_stop_serve(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut proc = state.ollama_process.lock().await;
    if let Some(ref mut child) = *proc {
        installer::stop_serve(child);
    }
    *proc = None;
    Ok(())
}
