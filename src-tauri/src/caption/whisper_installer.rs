use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
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

/// Directory where we store managed whisper binary on non-macOS platforms.
fn whisper_managed_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir()
        .ok_or_else(|| "Could not determine data directory".to_string())?;
    Ok(base.join("com.flexilingo.desk").join("whisper"))
}

/// Binary name for whisper-cli on current platform.
fn whisper_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "whisper-cli.exe"
    } else {
        "whisper-cli"
    }
}

/// Try to find whisper-cli binary at common paths.
pub fn detect_whisper_binary() -> Option<String> {
    // Check managed install location first (cross-platform).
    // Search subdirectories too — the zip extracts into a subfolder (e.g. whisper-bin-x64/)
    // and we leave the binary there alongside its DLLs.
    if let Ok(dir) = whisper_managed_dir() {
        if let Some(found) = find_whisper_binary_in_dir(&dir) {
            return found.to_str().map(|s| s.to_string());
        }
    }

    #[cfg(unix)]
    {
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
    }

    #[cfg(windows)]
    {
        // Check if whisper-cli is on PATH
        if let Ok(output) = std::process::Command::new("where")
            .arg("whisper-cli")
            .output()
        {
            if output.status.success() {
                if let Ok(path) = String::from_utf8(output.stdout) {
                    let first_line = path.lines().next().unwrap_or("").trim();
                    if !first_line.is_empty() && Path::new(first_line).is_file() {
                        return Some(first_line.to_string());
                    }
                }
            }
        }
    }

    None
}

/// Try to find Homebrew installation (macOS/Linux only).
pub fn detect_homebrew() -> Option<String> {
    #[cfg(unix)]
    {
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
    }
    None
}

/// Get full install status.
pub fn whisper_install_status() -> WhisperInstallStatus {
    let binary = detect_whisper_binary();
    let brew = detect_homebrew();
    let os = std::env::consts::OS;

    // can_auto_install: macOS (brew) or direct download (Linux/Windows)
    let can_auto_install = match os {
        "macos" => brew.is_some() || true, // can install brew + whisper, or direct download
        "linux" | "windows" => true,       // direct binary download
        _ => false,
    };

    WhisperInstallStatus {
        binary_detected: binary.is_some(),
        binary_path: binary,
        homebrew_available: brew.is_some(),
        homebrew_path: brew.clone(),
        can_auto_install,
        platform: os.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

/// GitHub release download URL for whisper.cpp pre-built binary.
/// Uses the CPU-only build (no CUDA required) for maximum compatibility.
fn whisper_download_url() -> Result<(&'static str, &'static str), String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Ok((
            "https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-bin-x64.zip",
            "zip",
        )),
        ("linux", "x86_64") => Ok((
            "https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-bin-x64.zip",
            "zip",
        )),
        ("linux", "aarch64") => Ok((
            "https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-bin-arm64.zip",
            "zip",
        )),
        (os, arch) => Err(format!("Direct download not available for {os}/{arch}. Use Homebrew instead.")),
    }
}

/// Recursively search a directory for a whisper binary (whisper-cli or main).
fn find_whisper_binary_in_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let names: &[&str] = if cfg!(target_os = "windows") {
        &["whisper-cli.exe", "main.exe"]
    } else {
        &["whisper-cli", "main"]
    };

    // Check root first
    for name in names {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    // Then check one level of subdirectories (zip usually extracts into a subfolder)
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                for name in names {
                    let candidate = path.join(name);
                    if candidate.is_file() {
                        return Some(candidate);
                    }
                }
            }
        }
    }

    None
}

/// Install whisper-cli via direct binary download (Windows/Linux).
pub async fn install_whisper_direct(app: &AppHandle) -> Result<String, String> {
    let (url, _ext) = whisper_download_url()?;
    let bin_dir = whisper_managed_dir()?;
    std::fs::create_dir_all(&bin_dir)
        .map_err(|e| format!("Failed to create directory: {e}"))?;

    let archive_path = bin_dir.join("whisper-download.zip");

    // Clean up previous download
    if archive_path.exists() {
        let _ = std::fs::remove_file(&archive_path);
    }

    emit_progress(app, "downloading", "Downloading whisper-cli...", 0.0);

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&archive_path)
        .await
        .map_err(|e| format!("Failed to create file: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_pct: f64 = -1.0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {e}"))?;
        downloaded += chunk.len() as u64;
        let pct = if total_bytes > 0 {
            (downloaded as f64 / total_bytes as f64) * 100.0
        } else {
            0.0
        };
        let rounded = (pct * 10.0).floor() / 10.0;
        if (rounded - last_pct).abs() >= 1.0 {
            last_pct = rounded;
            emit_progress(app, "downloading", &format!("Downloading... {rounded:.0}%"), rounded);
        }
    }

    file.flush().await.map_err(|e| format!("Flush error: {e}"))?;
    drop(file);

    // Extract
    emit_progress(app, "extracting", "Extracting whisper-cli...", -1.0);

    let archive_str = archive_path.to_str()
        .ok_or_else(|| "Path contains invalid UTF-8".to_string())?;
    let bin_dir_str = bin_dir.to_str()
        .ok_or_else(|| "Path contains invalid UTF-8".to_string())?;

    #[cfg(target_os = "windows")]
    let extract_result = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                archive_str, bin_dir_str
            ),
        ])
        .output();

    #[cfg(not(target_os = "windows"))]
    let extract_result = std::process::Command::new("unzip")
        .args(["-o", archive_str, "-d", bin_dir_str])
        .output();

    match extract_result {
        Ok(output) if output.status.success() => {}
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let _ = std::fs::remove_file(&archive_path);
            return Err(format!("Failed to extract: {stderr}"));
        }
        Err(e) => {
            let _ = std::fs::remove_file(&archive_path);
            return Err(format!("Failed to extract: {e}"));
        }
    }

    let _ = std::fs::remove_file(&archive_path);

    // Find the binary inside the extracted directory (may be in a subfolder).
    // IMPORTANT: do NOT move the binary — it needs its sibling DLLs (whisper.dll, ggml.dll, etc.)
    let found = find_whisper_binary_in_dir(&bin_dir)
        .ok_or_else(|| "whisper-cli was downloaded but could not be found after extraction. The archive may have a different structure.".to_string())?;

    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&found, std::fs::Permissions::from_mode(0o755));
    }

    let binary_str = found.to_str()
        .ok_or_else(|| "Path contains invalid UTF-8".to_string())?
        .to_string();

    // Sanity-check: run the binary with --help to catch CPU incompatibility early.
    // whisper-cli exits 0 on --help, but even a non-zero exit is fine here — the important
    // thing is that it doesn't crash with STATUS_ILLEGAL_INSTRUCTION (0xC000001D = -1073741795).
    emit_progress(app, "verifying", "Verifying binary compatibility...", 99.0);
    match std::process::Command::new(&binary_str).arg("--help").output() {
        Ok(out) => {
            let code = out.status.code().unwrap_or(0);
            if code == -1073741795_i32 {
                // Clean up the incompatible binary
                let _ = std::fs::remove_dir_all(&bin_dir);
                return Err(
                    "Whisper was downloaded but your CPU does not support the AVX2 instructions \
                     required by this build. Please install whisper-cpp manually from \
                     https://github.com/ggerganov/whisper.cpp and point the app to your binary \
                     in Settings → Speech Recognition.".to_string()
                );
            }
        }
        Err(_) => {} // Ignore launch errors here; they'll surface at transcription time
    }

    emit_progress(app, "complete", &format!("Installed at {binary_str}"), 100.0);
    Ok(binary_str)
}

/// Install whisper-cpp via Homebrew (macOS). Emits progress events line by line.
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

/// Platform-aware whisper installation: brew on macOS, direct download on Windows/Linux.
pub async fn install_whisper_auto(app: &AppHandle) -> Result<String, String> {
    match std::env::consts::OS {
        "macos" => {
            // Try brew first
            if let Some(brew_path) = detect_homebrew() {
                return install_whisper_via_brew(app, &brew_path).await;
            }
            // Install homebrew then whisper
            let brew_path = install_homebrew(app).await?;
            install_whisper_via_brew(app, &brew_path).await
        }
        "linux" | "windows" => {
            install_whisper_direct(app).await
        }
        os => Err(format!("Unsupported platform: {os}")),
    }
}

/// Install Homebrew itself (macOS only). Emits progress events.
pub async fn install_homebrew(app: &AppHandle) -> Result<String, String> {
    if std::env::consts::OS != "macos" && std::env::consts::OS != "linux" {
        return Err("Homebrew is only available on macOS and Linux".to_string());
    }

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
