use std::path::Path;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperInstallStatus {
    pub binary_detected: bool,
    pub binary_path: Option<String>,
    pub homebrew_available: bool,
    pub homebrew_path: Option<String>,
    pub can_auto_install: bool,
    pub platform: String,
    pub arch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperInstallProgress {
    pub status: String,
    pub message: String,
    pub percent: f64,
}

/// Try to find whisper-cli binary at common paths.
pub fn detect_whisper_binary() -> Option<String> {
    let candidates = [
        "/opt/homebrew/bin/whisper-cli",
        "/usr/local/bin/whisper-cli",
        "/opt/homebrew/bin/main",
        "/usr/local/bin/main",
    ];
    for path in &candidates {
        if Path::new(path).is_file() {
            return Some(path.to_string());
        }
    }
    None
}

/// Try to find Homebrew installation.
pub fn detect_homebrew() -> Option<String> {
    let candidates = [
        "/opt/homebrew/bin/brew",
        "/usr/local/bin/brew",
        "/home/linuxbrew/.linuxbrew/bin/brew",
    ];
    for path in &candidates {
        if Path::new(path).is_file() {
            return Some(path.to_string());
        }
    }
    None
}

/// Get full install status.
pub fn whisper_install_status() -> WhisperInstallStatus {
    let binary = detect_whisper_binary();
    let brew = detect_homebrew();
    let is_macos = std::env::consts::OS == "macos";

    WhisperInstallStatus {
        binary_detected: binary.is_some(),
        binary_path: binary,
        homebrew_available: brew.is_some(),
        homebrew_path: brew.clone(),
        can_auto_install: brew.is_some() && is_macos,
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

/// Install whisper-cpp via Homebrew. Emits progress events line by line.
pub async fn install_whisper_via_brew(
    app: &AppHandle,
    brew_path: &str,
) -> Result<String, String> {
    emit_progress(app, "installing_whisper", "Running brew install whisper-cpp...", -1.0);

    let mut child = Command::new(brew_path)
        .args(["install", "whisper-cpp"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run brew: {e}"))?;

    // Stream stderr (brew outputs progress to stderr)
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit_progress(app, "installing_whisper", &line, -1.0);
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("brew process error: {e}"))?;

    if !status.success() {
        return Err("brew install whisper-cpp failed. Check that Homebrew is up to date.".to_string());
    }

    // Detect the installed binary
    let binary = detect_whisper_binary()
        .ok_or_else(|| "whisper-cli was installed but could not be found at expected paths".to_string())?;

    emit_progress(app, "complete", &format!("Installed at {binary}"), 100.0);

    Ok(binary)
}

/// Install Homebrew itself. Emits progress events.
pub async fn install_homebrew(app: &AppHandle) -> Result<String, String> {
    emit_progress(app, "installing_homebrew", "Downloading Homebrew installer...", -1.0);

    let mut child = Command::new("/bin/bash")
        .args([
            "-c",
            "NONINTERACTIVE=1 /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run Homebrew installer: {e}"))?;

    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit_progress(app, "installing_homebrew", &line, -1.0);
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Homebrew installer error: {e}"))?;

    if !status.success() {
        return Err("Homebrew installation failed. On Intel Macs, it may require administrator access.".to_string());
    }

    let brew = detect_homebrew()
        .ok_or_else(|| "Homebrew was installed but could not be found at expected paths".to_string())?;

    emit_progress(app, "complete", &format!("Homebrew installed at {brew}"), 100.0);

    Ok(brew)
}

fn emit_progress(app: &AppHandle, status: &str, message: &str, percent: f64) {
    let _ = app.emit(
        "whisper-install-progress",
        WhisperInstallProgress {
            status: status.to_string(),
            message: message.to_string(),
            percent,
        },
    );
}
