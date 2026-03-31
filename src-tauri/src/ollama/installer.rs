use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

use super::types::OllamaInstallProgress;

/// Directory where we store the managed Ollama files (binary + libs).
pub fn ollama_bin_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir()
        .ok_or_else(|| "Could not determine data directory".to_string())?;
    Ok(base.join("com.flexilingo.desk").join("ollama"))
}

/// Full path to the managed Ollama binary.
pub fn ollama_binary_path() -> Result<PathBuf, String> {
    let name = if cfg!(target_os = "windows") {
        "ollama.exe"
    } else {
        "ollama"
    };
    Ok(ollama_bin_dir()?.join(name))
}

/// Check if our managed binary exists.
pub fn is_managed_ollama_installed() -> bool {
    ollama_binary_path()
        .map(|p| p.is_file())
        .unwrap_or(false)
}

/// Try to find a system-wide Ollama installation.
pub fn detect_system_ollama() -> Option<String> {
    #[cfg(unix)]
    {
        let candidates = [
            "/opt/homebrew/bin/ollama",
            "/usr/local/bin/ollama",
            "/usr/bin/ollama",
        ];
        for path in &candidates {
            if std::path::Path::new(path).is_file() {
                return Some(path.to_string());
            }
        }
    }
    #[cfg(windows)]
    {
        // Check common Windows install locations + PATH
        let candidates = [
            r"C:\Program Files\Ollama\ollama.exe",
            r"C:\Users\Default\AppData\Local\Programs\Ollama\ollama.exe",
        ];
        for path in &candidates {
            if std::path::Path::new(path).is_file() {
                return Some(path.to_string());
            }
        }
        // Also check if ollama is on PATH via `where`
        if let Ok(output) = Command::new("where").arg("ollama").output() {
            if output.status.success() {
                if let Ok(path) = String::from_utf8(output.stdout) {
                    let first_line = path.lines().next().unwrap_or("").trim();
                    if !first_line.is_empty() && std::path::Path::new(first_line).is_file() {
                        return Some(first_line.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Get the best available Ollama binary path (system or managed).
pub fn resolve_ollama_binary() -> Option<String> {
    if let Some(sys) = detect_system_ollama() {
        return Some(sys);
    }
    if let Ok(managed) = ollama_binary_path() {
        if managed.is_file() {
            return managed.to_str().map(|s| s.to_string());
        }
    }
    None
}

/// Platform download URL and archive extension.
/// macOS: .tgz (gzip tar), Linux: .tar.zst (zstd tar), Windows: .zip
fn download_info() -> Result<(&'static str, &'static str), String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", _) => Ok((
            "https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz",
            "tgz",
        )),
        ("linux", "x86_64") => Ok((
            "https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst",
            "tar.zst",
        )),
        ("linux", "aarch64") => Ok((
            "https://github.com/ollama/ollama/releases/latest/download/ollama-linux-arm64.tar.zst",
            "tar.zst",
        )),
        ("windows", "x86_64") => Ok((
            "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip",
            "zip",
        )),
        ("windows", "aarch64") => Ok((
            "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-arm64.zip",
            "zip",
        )),
        (os, arch) => Err(format!("Unsupported platform: {os}/{arch}")),
    }
}

/// Download and extract the Ollama archive with streaming progress.
pub async fn download_ollama(app: &AppHandle) -> Result<String, String> {
    let (url, ext) = download_info()?;
    let bin_dir = ollama_bin_dir()?;
    std::fs::create_dir_all(&bin_dir)
        .map_err(|e| format!("Failed to create directory: {e}"))?;

    let archive_name = format!("ollama-download.{ext}");
    let archive_path = bin_dir.join(&archive_name);

    // Clean up any previous partial download
    if archive_path.exists() {
        let _ = std::fs::remove_file(&archive_path);
    }

    // ── Step 1: Download archive ──
    emit_progress(app, "downloading", 0, 0, 0.0);

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
    let mut last_emit_percent: f64 = -1.0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {e}"))?;

        downloaded += chunk.len() as u64;

        let percent = if total_bytes > 0 {
            (downloaded as f64 / total_bytes as f64) * 100.0
        } else {
            0.0
        };

        let rounded = (percent * 10.0).floor() / 10.0;
        if (rounded - last_emit_percent).abs() >= 1.0 {
            last_emit_percent = rounded;
            emit_progress(app, "downloading", downloaded, total_bytes, rounded);
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {e}"))?;
    drop(file);

    // ── Step 2: Extract archive ──
    emit_progress(app, "extracting", total_bytes, total_bytes, 100.0);

    let bin_dir_str = bin_dir
        .to_str()
        .ok_or_else(|| "Path contains invalid UTF-8".to_string())?;
    let archive_str = archive_path
        .to_str()
        .ok_or_else(|| "Path contains invalid UTF-8".to_string())?;

    let extract_result = if ext == "tgz" {
        // macOS: tar xzf
        Command::new("tar")
            .args(["xzf", archive_str, "-C", bin_dir_str])
            .output()
    } else if ext == "tar.zst" {
        // Linux: tar with zstd
        Command::new("tar")
            .args(["--zstd", "-xf", archive_str, "-C", bin_dir_str])
            .output()
    } else {
        // Windows: PowerShell Expand-Archive
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                    archive_str, bin_dir_str
                ),
            ])
            .output()
    };

    match extract_result {
        Ok(output) if output.status.success() => {}
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let _ = std::fs::remove_file(&archive_path);
            return Err(format!("Failed to extract archive: {stderr}"));
        }
        Err(e) => {
            let _ = std::fs::remove_file(&archive_path);
            return Err(format!("Failed to extract: {e}"));
        }
    }

    // Clean up archive
    let _ = std::fs::remove_file(&archive_path);

    // ── Step 3: Verify binary exists ──
    let binary_name = if cfg!(target_os = "windows") {
        "ollama.exe"
    } else {
        "ollama"
    };
    let binary = bin_dir.join(binary_name);
    if !binary.is_file() {
        return Err("Archive extracted but ollama binary not found".to_string());
    }

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {e}"))?;
    }

    emit_progress(app, "complete", total_bytes, total_bytes, 100.0);

    binary
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Path contains invalid UTF-8".to_string())
}

fn emit_progress(app: &AppHandle, status: &str, downloaded: u64, total: u64, percent: f64) {
    let _ = app.emit(
        "ollama-install-progress",
        OllamaInstallProgress {
            downloaded_bytes: downloaded,
            total_bytes: total,
            percent,
            status: status.to_string(),
        },
    );
}

/// Start `ollama serve` as a background process.
/// Sets OLLAMA_HOST if needed and LD_LIBRARY_PATH/DYLD_LIBRARY_PATH for shared libs.
pub fn start_serve(binary_path: &str) -> Result<Child, String> {
    let binary = std::path::Path::new(binary_path);
    let lib_dir = binary
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut cmd = Command::new(binary_path);
    cmd.arg("serve")
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    // Set library path so ollama can find its shared libs
    #[cfg(target_os = "macos")]
    {
        cmd.env("DYLD_LIBRARY_PATH", &lib_dir);
    }
    #[cfg(target_os = "linux")]
    {
        cmd.env("LD_LIBRARY_PATH", &lib_dir);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start ollama serve: {e}"))?;

    Ok(child)
}

/// Wait for Ollama to become healthy (up to timeout).
pub async fn wait_healthy(base_url: &str, timeout_secs: u64) -> bool {
    let client = reqwest::Client::new();
    let url = format!("{base_url}/api/version");
    let deadline = tokio::time::Instant::now() + Duration::from_secs(timeout_secs);

    while tokio::time::Instant::now() < deadline {
        if let Ok(resp) = client
            .get(&url)
            .timeout(Duration::from_secs(2))
            .send()
            .await
        {
            if resp.status().is_success() {
                return true;
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    false
}

/// Stop a managed Ollama serve process.
pub fn stop_serve(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}
