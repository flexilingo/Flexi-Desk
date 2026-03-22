use serde::Serialize;
use tauri::State;

use crate::AppState;

#[derive(Debug, Serialize)]
pub struct SpacyStatusResponse {
    pub running: bool,
    pub models: Vec<String>,
}

#[tauri::command]
pub async fn sidecar_start_spacy(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let mut guard = state.spacy.lock().await;
    if guard.is_some() {
        return Ok("already_running".to_string());
    }

    // Try to find python3
    let python = std::process::Command::new("which")
        .arg("python3")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .or_else(|| {
            std::process::Command::new("which")
                .arg("python")
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        })
        .ok_or("Python not found. Install Python 3.8+ to use spaCy.")?;

    let data_dir = dirs::data_dir()
        .ok_or("Could not determine data directory")?
        .join("com.flexilingo.desk");

    let script = data_dir.join("spacy_server.py");
    if !script.exists() {
        return Err("spaCy server script not found. Please reinstall the app.".to_string());
    }

    let sidecar = crate::sidecar::SpacySidecar::spawn(
        &python,
        script.to_str().unwrap_or(""),
    )?;

    *guard = Some(sidecar);
    Ok("started".to_string())
}

#[tauri::command]
pub async fn sidecar_stop_spacy(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let mut guard = state.spacy.lock().await;
    if let Some(ref mut sidecar) = *guard {
        sidecar.kill().await?;
    }
    *guard = None;
    Ok("stopped".to_string())
}

#[tauri::command]
pub async fn sidecar_spacy_status(
    state: State<'_, AppState>,
) -> Result<SpacyStatusResponse, String> {
    let mut guard = state.spacy.lock().await;
    let running = match &mut *guard {
        Some(sidecar) => sidecar.is_running(),
        None => false,
    };

    // If it was running but crashed, clean up
    if !running && guard.is_some() {
        *guard = None;
    }

    Ok(SpacyStatusResponse {
        running,
        models: vec![],
    })
}

#[tauri::command]
pub async fn sidecar_list_spacy_models() -> Result<Vec<String>, String> {
    // List installed spaCy models by checking common model directories
    let output = tokio::process::Command::new("python3")
        .args(["-c", "import spacy; print('\\n'.join(spacy.util.get_installed_models()))"])
        .output()
        .await
        .map_err(|e| format!("Failed to list spaCy models: {e}"))?;

    if !output.status.success() {
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let models: Vec<String> = stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    Ok(models)
}
