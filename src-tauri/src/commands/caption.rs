use tauri::{Emitter, State};
use futures_util::StreamExt;

use crate::caption::audio;
use crate::caption::sidecar::WhisperSidecar;
use crate::caption::types::*;
use crate::caption::whisper;
use crate::AppState;

// ── Model Registry ────────────────────────────────────────

// All models are multilingual and support 99+ languages.
// (id, name, size_mb, description, en_only, speed, accuracy)
const MODELS: &[(&str, &str, u64, &str, bool, &str, &str)] = &[
    // ── Tiny ──────────────────────────────────────────
    ("tiny",             "Tiny",              75,   "Fastest model. Good for testing. Supports all languages.",       false, "~32x realtime", "~88%"),
    ("tiny-q5_1",        "Tiny Q5",           42,   "Quantized tiny. Smaller file, similar accuracy.",               false, "~32x realtime", "~87%"),
    ("tiny-q8_0",        "Tiny Q8",           57,   "Quantized tiny (8-bit). Better quality than Q5.",               false, "~32x realtime", "~88%"),
    // ── Base ──────────────────────────────────────────
    ("base",             "Base",              142,  "Good balance of speed and accuracy. Supports all languages.",   false, "~16x realtime", "~92%"),
    ("base-q5_1",        "Base Q5",           82,   "Quantized base. Smaller file, similar accuracy.",               false, "~16x realtime", "~91%"),
    ("base-q8_0",        "Base Q8",           110,  "Quantized base (8-bit). Better quality than Q5.",               false, "~16x realtime", "~92%"),
    // ── Small ─────────────────────────────────────────
    ("small",            "Small",             466,  "Better accuracy, moderate speed. Supports all languages.",      false, "~6x realtime",  "~95%"),
    ("small-q5_1",       "Small Q5",          252,  "Quantized small. Half the size, similar accuracy.",             false, "~6x realtime",  "~94%"),
    ("small-q8_0",       "Small Q8",          370,  "Quantized small (8-bit). Better quality than Q5.",              false, "~6x realtime",  "~95%"),
    // ── Medium ────────────────────────────────────────
    ("medium",           "Medium",            1500, "High accuracy, slower. Supports all languages.",                false, "~2x realtime",  "~97%"),
    ("medium-q5_0",      "Medium Q5",         880,  "Quantized medium. Much smaller, similar accuracy.",             false, "~2x realtime",  "~96%"),
    ("medium-q8_0",      "Medium Q8",         1200, "Quantized medium (8-bit). Better quality than Q5.",             false, "~2x realtime",  "~97%"),
    // ── Large ─────────────────────────────────────────
    ("large-v1",         "Large v1",          3100, "Original large model. High accuracy.",                          false, "~1x realtime",  "~97%"),
    ("large-v2",         "Large v2",          3100, "Improved large model. Better than v1.",                         false, "~1x realtime",  "~97.5%"),
    ("large-v2-q5_0",    "Large v2 Q5",       1800, "Quantized large v2. Much smaller.",                             false, "~1x realtime",  "~97%"),
    ("large-v2-q8_0",    "Large v2 Q8",       2500, "Quantized large v2 (8-bit).",                                   false, "~1x realtime",  "~97.5%"),
    ("large-v3",         "Large v3",          3100, "Best accuracy. Requires powerful hardware.",                    false, "~1x realtime",  "~98%"),
    ("large-v3-q5_0",    "Large v3 Q5",       1800, "Quantized large v3. Half size, near-same accuracy.",            false, "~1x realtime",  "~97.5%"),
    // ── Turbo (Recommended) ──────────────────────────
    ("large-v3-turbo",       "Large v3 Turbo",     1600, "Best speed/accuracy ratio. Recommended for most users.",   false, "~8x realtime",  "~97.5%"),
    ("large-v3-turbo-q5_0",  "Large v3 Turbo Q5",  900,  "Quantized turbo. Compact & fast.",                         false, "~8x realtime",  "~97%"),
    ("large-v3-turbo-q8_0",  "Large v3 Turbo Q8",  1300, "Quantized turbo (8-bit). Better quality than Q5.",         false, "~8x realtime",  "~97.5%"),
];

// ── Helper ─────────────────────────────────────────────────

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

fn lock_caption<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, CaptionEngineState>, String> {
    state
        .caption
        .lock()
        .map_err(|e| format!("Caption state lock error: {e}"))
}

// ── Device Commands ────────────────────────────────────────

#[tauri::command]
pub fn caption_list_devices() -> Result<Vec<AudioDevice>, String> {
    audio::list_input_devices()
}

// ── Capture Commands ───────────────────────────────────────

#[tauri::command]
pub fn caption_start_capture(
    state: State<'_, AppState>,
    device_id: Option<String>,
    language: Option<String>,
) -> Result<CaptionSession, String> {
    let lang = language.unwrap_or_else(|| "auto".to_string());

    // Ensure we're not already capturing
    {
        let caption = lock_caption(&state)?;
        if caption.is_capturing() {
            return Err("Already capturing audio. Stop the current session first.".into());
        }
    }

    // Create session in DB
    let session_id = {
        let conn = lock_db(&state)?;

        let device_name = device_id.as_deref().unwrap_or("default");
        conn.execute(
            "INSERT INTO caption_sessions (id, language, source_type, device_name, status)
             VALUES (lower(hex(randomblob(16))), ?1, 'mic', ?2, 'capturing')",
            rusqlite::params![lang, device_name],
        )
        .map_err(|e| format!("Session create error: {e}"))?;

        let rowid = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id FROM caption_sessions WHERE rowid = ?1",
            rusqlite::params![rowid],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?
    };

    // Build temp WAV path
    let data_dir = dirs::data_dir()
        .ok_or("Cannot determine data directory")?
        .join("com.flexilingo.desk")
        .join("recordings");

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create recordings dir: {e}"))?;

    let wav_path = data_dir.join(format!("{session_id}.wav"));

    // Start recording
    let handle = audio::start_recording(device_id.as_deref(), wav_path.clone())?;

    // Update engine state
    {
        let mut caption = lock_caption(&state)?;
        caption.recording = Some(handle);
        caption.active_session_id = Some(session_id.clone());
        caption.recording_path = Some(wav_path);
    }

    get_session_by_id(&state, &session_id)
}

#[tauri::command]
pub fn caption_stop_capture(
    state: State<'_, AppState>,
) -> Result<CaptionSession, String> {
    let (handle, session_id, _wav_path) = {
        let mut caption = lock_caption(&state)?;

        let handle = caption
            .recording
            .take()
            .ok_or("Not currently capturing audio")?;

        let session_id = caption
            .active_session_id
            .take()
            .ok_or("No active session")?;

        let wav_path = caption
            .recording_path
            .take()
            .ok_or("No recording path")?;

        (handle, session_id, wav_path)
    };

    // Stop the recording thread and get the result
    let result = handle.stop()?;

    // Update session in DB
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE caption_sessions SET
                duration_seconds = ?1,
                status = 'processing',
                completed_at = datetime('now')
             WHERE id = ?2",
            rusqlite::params![result.duration_seconds, session_id],
        )
        .map_err(|e| format!("Session update error: {e}"))?;
    }

    get_session_by_id(&state, &session_id)
}

#[tauri::command]
pub fn caption_get_status(
    state: State<'_, AppState>,
) -> Result<CaptionStatus, String> {
    let caption = lock_caption(&state)?;

    let device_name = if caption.is_capturing() {
        // Read from active session
        caption
            .active_session_id
            .as_ref()
            .and_then(|sid| {
                let conn = state.db.lock().ok()?;
                conn.query_row(
                    "SELECT device_name FROM caption_sessions WHERE id = ?1",
                    rusqlite::params![sid],
                    |row: &rusqlite::Row| row.get(0),
                )
                .ok()
            })
    } else {
        None
    };

    Ok(CaptionStatus {
        is_capturing: caption.is_capturing(),
        is_live_capturing: caption.is_live(),
        is_transcribing: caption.is_transcribing,
        active_session_id: caption.active_session_id.clone(),
        device_name,
    })
}

// ── Transcription Commands ─────────────────────────────────

#[tauri::command]
pub async fn caption_transcribe_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<TranscriptionResult, String> {
    // 1. Get session info and whisper config
    let (source_file, language, binary_path, model_path) = {
        let conn = lock_db(&state)?;

        let (source_type, source_file, lang): (String, Option<String>, String) = conn
            .query_row(
                "SELECT source_type, source_file, language FROM caption_sessions WHERE id = ?1",
                rusqlite::params![session_id],
                |row: &rusqlite::Row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| format!("Session not found: {e}"))?;

        let audio_path = match source_type.as_str() {
            "file" => source_file.ok_or("No source file for file session")?,
            _ => {
                // mic/system recordings are stored at a known path
                let data_dir = dirs::data_dir()
                    .ok_or("Cannot determine data directory")?
                    .join("com.flexilingo.desk")
                    .join("recordings");
                let p = data_dir.join(format!("{session_id}.wav"));
                p.to_string_lossy().to_string()
            }
        };

        let bin = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'whisper_binary_path'",
                [],
                |row: &rusqlite::Row| row.get::<_, String>(0),
            )
            .map_err(|_| {
                "Whisper binary not configured. Go to Settings → Whisper to set it up.".to_string()
            })?;

        let model = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'whisper_model_path'",
                [],
                |row: &rusqlite::Row| row.get::<_, String>(0),
            )
            .map_err(|_| {
                "Whisper model not configured. Go to Settings → Whisper to set it up.".to_string()
            })?;

        (audio_path, lang, bin, model)
    };

    // 2. Mark as transcribing (separate scopes to avoid deadlock)
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE caption_sessions SET status = 'processing' WHERE id = ?1",
            rusqlite::params![session_id],
        )
        .map_err(|e| format!("Status update error: {e}"))?;
    }
    {
        let mut caption = lock_caption(&state)?;
        caption.is_transcribing = true;
    }

    // 3. Run whisper (this is the async await point — no locks held)
    let segments_result = whisper::transcribe_file(
        &binary_path,
        &model_path,
        &source_file,
        &language,
    )
    .await;

    // 4. Handle result
    match segments_result {
        Ok(parsed_segments) => {
            // Store segments in DB
            let conn = lock_db(&state)?;

            for seg in &parsed_segments {
                let word_ts_json = serde_json::to_string(&seg.words)
                    .unwrap_or_else(|_| "[]".into());

                conn.execute(
                    "INSERT INTO caption_segments
                        (id, session_id, text, language, confidence, start_time_ms, end_time_ms, word_timestamps)
                     VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    rusqlite::params![
                        session_id,
                        seg.text,
                        seg.language,
                        seg.confidence,
                        seg.start_ms,
                        seg.end_ms,
                        word_ts_json,
                    ],
                )
                .map_err(|e| format!("Segment insert error: {e}"))?;
            }

            // Update session stats
            let word_count: i64 = parsed_segments
                .iter()
                .map(|s| s.text.split_whitespace().count() as i64)
                .sum();

            let duration = parsed_segments
                .last()
                .map(|s| s.end_ms / 1000)
                .unwrap_or(0);

            conn.execute(
                "UPDATE caption_sessions SET
                    status = 'completed',
                    segment_count = ?1,
                    word_count = ?2,
                    duration_seconds = CASE WHEN duration_seconds = 0 THEN ?3 ELSE duration_seconds END,
                    completed_at = datetime('now')
                 WHERE id = ?4",
                rusqlite::params![
                    parsed_segments.len() as i64,
                    word_count,
                    duration,
                    session_id,
                ],
            )
            .map_err(|e| format!("Session update error: {e}"))?;

            drop(conn);

            // Clear transcribing flag
            if let Ok(mut caption) = lock_caption(&state) {
                caption.is_transcribing = false;
            }

            // Fetch final session + segments
            let session = get_session_by_id(&state, &session_id)?;
            let segments = get_segments_by_session(&state, &session_id)?;

            Ok(TranscriptionResult { session, segments })
        }
        Err(err) => {
            // Mark session as failed
            let conn = lock_db(&state)?;
            conn.execute(
                "UPDATE caption_sessions SET status = 'failed', error_message = ?1 WHERE id = ?2",
                rusqlite::params![err, session_id],
            )
            .ok();

            drop(conn);
            if let Ok(mut caption) = lock_caption(&state) {
                caption.is_transcribing = false;
            }

            Err(err)
        }
    }
}

#[tauri::command]
pub async fn caption_transcribe_file(
    state: State<'_, AppState>,
    file_path: String,
    language: Option<String>,
) -> Result<TranscriptionResult, String> {
    let lang = language.unwrap_or_else(|| "auto".to_string());

    if !std::path::Path::new(&file_path).exists() {
        return Err(format!("File not found: {file_path}"));
    }

    // Create a session for this file
    let session_id = {
        let conn = lock_db(&state)?;
        conn.execute(
            "INSERT INTO caption_sessions (id, language, source_type, source_file, status)
             VALUES (lower(hex(randomblob(16))), ?1, 'file', ?2, 'processing')",
            rusqlite::params![lang, file_path],
        )
        .map_err(|e| format!("Session create error: {e}"))?;

        let rowid = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id FROM caption_sessions WHERE rowid = ?1",
            rusqlite::params![rowid],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?
    };

    // Delegate to the session transcription
    caption_transcribe_session(state, session_id).await
}

// ── Session CRUD ───────────────────────────────────────────

#[tauri::command]
pub fn caption_list_sessions(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<CaptionSession>, String> {
    let conn = lock_db(&state)?;
    let max = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT id, language, source_type, source_file, device_name,
                    whisper_model, duration_seconds, segment_count, word_count,
                    status, error_message, created_at, completed_at
             FROM caption_sessions
             ORDER BY created_at DESC
             LIMIT ?1",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![max], map_session_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(sessions)
}

#[tauri::command]
pub fn caption_get_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<CaptionSession, String> {
    get_session_by_id(&state, &id)
}

#[tauri::command]
pub fn caption_get_segments(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<CaptionSegment>, String> {
    get_segments_by_session(&state, &session_id)
}

#[tauri::command]
pub fn caption_delete_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;

    // Also delete the WAV file if it exists
    let source_type: Option<String> = conn
        .query_row(
            "SELECT source_type FROM caption_sessions WHERE id = ?1",
            rusqlite::params![id],
            |row: &rusqlite::Row| row.get(0),
        )
        .ok();

    if source_type.as_deref() == Some("mic") || source_type.as_deref() == Some("system") {
        let wav_path = dirs::data_dir()
            .map(|d| d.join("com.flexilingo.desk").join("recordings").join(format!("{id}.wav")));
        if let Some(path) = wav_path {
            let _ = std::fs::remove_file(path);
        }
    }

    conn.execute(
        "DELETE FROM caption_sessions WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;

    Ok(())
}

// ── Whisper Config Commands ────────────────────────────────

#[tauri::command]
pub fn caption_check_whisper(
    state: State<'_, AppState>,
) -> Result<WhisperInfo, String> {
    let conn = lock_db(&state)?;

    let binary_path: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'whisper_binary_path'",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .ok();

    let model_path: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'whisper_model_path'",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .ok();

    let model_name: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'whisper_model_name'",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .ok();

    let is_available = binary_path
        .as_deref()
        .map(whisper::check_binary)
        .unwrap_or(false)
        && model_path
            .as_deref()
            .map(whisper::check_model)
            .unwrap_or(false);

    Ok(WhisperInfo {
        is_available,
        binary_path,
        model_path,
        model_name,
    })
}

#[tauri::command]
pub fn caption_configure_whisper(
    state: State<'_, AppState>,
    binary_path: String,
    model_path: String,
    model_name: Option<String>,
) -> Result<WhisperInfo, String> {
    // Validate paths
    if !whisper::check_binary(&binary_path) {
        return Err(format!("Whisper binary not found or not executable: {binary_path}"));
    }
    if !whisper::check_model(&model_path) {
        return Err(format!("Whisper model file not found: {model_path}"));
    }

    let conn = lock_db(&state)?;

    // Upsert settings
    for (key, value) in [
        ("whisper_binary_path", binary_path.as_str()),
        ("whisper_model_path", model_path.as_str()),
    ] {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')",
            rusqlite::params![key, value],
        )
        .map_err(|e| format!("Settings update error: {e}"))?;
    }

    if let Some(ref name) = model_name {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('whisper_model_name', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')",
            rusqlite::params![name],
        )
        .map_err(|e| format!("Settings update error: {e}"))?;
    }

    Ok(WhisperInfo {
        is_available: true,
        binary_path: Some(binary_path),
        model_path: Some(model_path),
        model_name,
    })
}

// ── Model Download Commands ────────────────────────────────

fn models_dir() -> Result<std::path::PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or("Cannot determine data directory")?
        .join("com.flexilingo.desk")
        .join("whisper-models");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create models directory: {e}"))?;
    Ok(dir)
}

#[tauri::command]
pub fn caption_list_available_models() -> Result<Vec<AvailableModel>, String> {
    let dir = models_dir()?;
    let mut models = Vec::new();

    for &(id, name, size_mb, desc, en_only, speed, accuracy) in MODELS {
        let file_name = format!("ggml-{id}.bin");
        let local_path = dir.join(&file_name);
        let is_downloaded = local_path.exists();

        models.push(AvailableModel {
            id: id.to_string(),
            name: name.to_string(),
            size_mb,
            description: desc.to_string(),
            is_english_only: en_only,
            is_downloaded,
            local_path: if is_downloaded {
                Some(local_path.to_string_lossy().to_string())
            } else {
                None
            },
            speed: speed.to_string(),
            accuracy: accuracy.to_string(),
        });
    }

    Ok(models)
}

#[tauri::command]
pub async fn caption_download_model(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<String, String> {
    // Validate model ID
    if !MODELS.iter().any(|m| m.0 == model_id.as_str()) {
        return Err(format!("Unknown model: {model_id}"));
    }

    let dir = models_dir()?;
    let file_name = format!("ggml-{model_id}.bin");
    let dest_path = dir.join(&file_name);

    // Already downloaded?
    if dest_path.exists() {
        return Ok(dest_path.to_string_lossy().to_string());
    }

    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{file_name}"
    );

    // Start download with progress
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Download request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);

    // Write to a temp file first, then rename
    let tmp_path = dest_path.with_extension("bin.tmp");
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| format!("Failed to create file: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_emit_percent: f64 = -1.0;

    use tokio::io::AsyncWriteExt;

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

        // Emit progress every 1%
        let rounded = (percent * 10.0).floor() / 10.0;
        if (rounded - last_emit_percent).abs() >= 1.0 {
            last_emit_percent = rounded;
            let _ = app.emit("whisper-download-progress", DownloadProgress {
                model_id: model_id.clone(),
                downloaded_bytes: downloaded,
                total_bytes,
                percent: rounded,
            });
        }
    }

    file.flush().await.map_err(|e| format!("Flush error: {e}"))?;
    drop(file);

    // Rename temp → final
    tokio::fs::rename(&tmp_path, &dest_path)
        .await
        .map_err(|e| format!("Rename error: {e}"))?;

    // Emit 100% complete
    let _ = app.emit("whisper-download-progress", DownloadProgress {
        model_id: model_id.clone(),
        downloaded_bytes: total_bytes,
        total_bytes,
        percent: 100.0,
    });

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn caption_delete_model(model_id: String) -> Result<(), String> {
    let dir = models_dir()?;
    let file_name = format!("ggml-{model_id}.bin");
    let path = dir.join(&file_name);

    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete model: {e}"))?;
    }

    Ok(())
}

// ── Model Compatibility Check ──────────────────────────────

#[tauri::command]
pub fn caption_check_model_for_language(
    state: State<'_, AppState>,
    language: String,
) -> Result<ModelCompatibility, String> {
    let conn = lock_db(&state)?;

    // Get current model name
    let current_model: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'whisper_model_name'",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .ok();

    // Normalize language (e.g. "en-us" → "en")
    let lang = language
        .split(|c| c == '-' || c == '_')
        .next()
        .unwrap_or("auto")
        .to_lowercase();

    // Check compatibility: .en models only work for English
    let is_en_model = current_model
        .as_ref()
        .map(|m| m.contains(".en"))
        .unwrap_or(false);

    let is_compatible = if current_model.is_none() {
        false // No model configured at all
    } else if lang == "en" || lang == "auto" {
        true // English or auto-detect works with any model
    } else {
        !is_en_model // Non-English language needs a multilingual model
    };

    // Build suggested models list (only if incompatible)
    let suggested_models = if is_compatible {
        Vec::new()
    } else {
        let dir = models_dir()?;
        let mut suggestions = Vec::new();

        for &(id, name, size_mb, desc, en_only, speed, accuracy) in MODELS {
            if en_only {
                continue; // Skip English-only models
            }

            let file_name = format!("ggml-{id}.bin");
            let local_path = dir.join(&file_name);
            let is_downloaded = local_path.exists();

            suggestions.push(AvailableModel {
                id: id.to_string(),
                name: name.to_string(),
                size_mb,
                description: desc.to_string(),
                is_english_only: false,
                is_downloaded,
                local_path: if is_downloaded {
                    Some(local_path.to_string_lossy().to_string())
                } else {
                    None
                },
                speed: speed.to_string(),
                accuracy: accuracy.to_string(),
            });
        }

        // Sort: downloaded first, then by size (prefer turbo models)
        suggestions.sort_by(|a, b| {
            b.is_downloaded.cmp(&a.is_downloaded)
                .then_with(|| {
                    // Prioritize turbo models
                    let a_turbo = a.id.contains("turbo");
                    let b_turbo = b.id.contains("turbo");
                    b_turbo.cmp(&a_turbo)
                })
        });

        suggestions
    };

    Ok(ModelCompatibility {
        is_compatible,
        current_model,
        suggested_models,
    })
}

// ── Live Caption Commands ────────────────────────────────

/// Derive the whisper-stream binary path from the whisper-cli path.
/// e.g. "/opt/homebrew/bin/whisper-cli" → "/opt/homebrew/bin/whisper-stream"
fn derive_stream_binary(cli_binary_path: &str) -> String {
    let path = std::path::Path::new(cli_binary_path);
    let dir = path.parent().unwrap_or(std::path::Path::new(""));
    dir.join("whisper-stream").to_string_lossy().to_string()
}

#[tauri::command]
pub async fn caption_start_live_capture(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    device_id: Option<String>,
    language: Option<String>,
    model_id: Option<String>,
) -> Result<CaptionSession, String> {
    let lang = language.unwrap_or_else(|| "auto".to_string());

    // Ensure we're not already capturing
    {
        let caption = lock_caption(&state)?;
        if caption.is_capturing() || caption.is_live() {
            return Err("Already capturing audio. Stop the current session first.".into());
        }
    }

    // Resolve whisper binary + model paths
    let (cli_binary_path, model_path, model_name) = {
        let conn = lock_db(&state)?;

        let bin = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'whisper_binary_path'",
                [],
                |row: &rusqlite::Row| row.get::<_, String>(0),
            )
            .map_err(|_| {
                "Whisper binary not configured. Go to Settings → Whisper to set it up.".to_string()
            })?;

        // If a model_id is provided, resolve its path from the models dir
        let (model, name) = if let Some(ref mid) = model_id {
            let dir = models_dir()?;
            let file_name = format!("ggml-{mid}.bin");
            let path = dir.join(&file_name);
            if !path.exists() {
                return Err(format!("Model not downloaded: {mid}"));
            }
            (path.to_string_lossy().to_string(), mid.clone())
        } else {
            // Use configured model
            let model = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'whisper_model_path'",
                    [],
                    |row: &rusqlite::Row| row.get::<_, String>(0),
                )
                .map_err(|_| {
                    "Whisper model not configured. Go to Settings → Whisper to set it up."
                        .to_string()
                })?;
            let name = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'whisper_model_name'",
                    [],
                    |row: &rusqlite::Row| row.get::<_, String>(0),
                )
                .unwrap_or_else(|_| "unknown".to_string());
            (model, name)
        };

        (bin, model, name)
    };

    // Derive whisper-stream binary path from whisper-cli path
    let stream_binary = derive_stream_binary(&cli_binary_path);

    // Create session in DB
    let session_id = {
        let conn = lock_db(&state)?;
        let device_name = device_id.as_deref().unwrap_or("default");
        conn.execute(
            "INSERT INTO caption_sessions (id, language, source_type, device_name, whisper_model, status)
             VALUES (lower(hex(randomblob(16))), ?1, 'mic', ?2, ?3, 'live-capturing')",
            rusqlite::params![lang, device_name, model_name],
        )
        .map_err(|e| format!("Session create error: {e}"))?;

        let rowid = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id FROM caption_sessions WHERE rowid = ?1",
            rusqlite::params![rowid],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?
    };

    // Spawn whisper-stream sidecar (it captures audio directly)
    let sidecar = WhisperSidecar::spawn(
        &stream_binary,
        &model_path,
        &lang,
        None, // use default capture device (whisper-stream handles device selection)
        session_id.clone(),
        app,
    )?;

    // Store sidecar
    {
        let mut sidecar_lock = state.sidecar.lock().await;
        *sidecar_lock = Some(sidecar);
    }

    // Build WAV path for archival
    let data_dir = dirs::data_dir()
        .ok_or("Cannot determine data directory")?
        .join("com.flexilingo.desk")
        .join("recordings");

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create recordings dir: {e}"))?;

    let wav_path = data_dir.join(format!("{session_id}.wav"));

    // Start a simple WAV recording for archival (parallel to whisper-stream)
    let recording_handle = audio::start_recording(
        device_id.as_deref(),
        wav_path.clone(),
    )?;

    // Update engine state
    {
        let mut caption = lock_caption(&state)?;
        caption.recording = Some(recording_handle);
        caption.active_session_id = Some(session_id.clone());
        caption.recording_path = Some(wav_path);
        caption.is_live_capturing = true;
    }

    get_session_by_id(&state, &session_id)
}

#[tauri::command]
pub async fn caption_stop_live_capture(
    state: State<'_, AppState>,
) -> Result<CaptionSession, String> {
    let (recording_handle, session_id) = {
        let mut caption = lock_caption(&state)?;

        if !caption.is_live_capturing {
            return Err("Not currently live-capturing".into());
        }

        let recording = caption.recording.take();
        let session_id = caption
            .active_session_id
            .take()
            .ok_or("No active session")?;

        caption.is_live_capturing = false;
        caption.recording_path = None;

        (recording, session_id)
    };

    // Stop the sidecar (kills whisper-stream process)
    {
        let mut sidecar_lock = state.sidecar.lock().await;
        if let Some(sidecar) = sidecar_lock.take() {
            sidecar.stop().await?;
        }
    }

    // Stop WAV recording (flushes remaining audio + saves file)
    let duration_seconds = if let Some(handle) = recording_handle {
        let result = handle.stop()?;
        result.duration_seconds
    } else {
        0
    };

    // Update session in DB
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE caption_sessions SET
                duration_seconds = ?1,
                status = 'completed',
                completed_at = datetime('now')
             WHERE id = ?2",
            rusqlite::params![duration_seconds, session_id],
        )
        .map_err(|e| format!("Session update error: {e}"))?;
    }

    get_session_by_id(&state, &session_id)
}

#[tauri::command]
pub fn caption_set_active_model(
    state: State<'_, AppState>,
    model_id: String,
) -> Result<WhisperInfo, String> {
    // Validate model exists
    if !MODELS.iter().any(|m| m.0 == model_id.as_str()) {
        return Err(format!("Unknown model: {model_id}"));
    }

    let dir = models_dir()?;
    let file_name = format!("ggml-{model_id}.bin");
    let model_path = dir.join(&file_name);

    if !model_path.exists() {
        return Err(format!("Model not downloaded: {model_id}"));
    }

    let conn = lock_db(&state)?;

    // Update model path and name in settings
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('whisper_model_path', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')",
        rusqlite::params![model_path.to_string_lossy().to_string()],
    )
    .map_err(|e| format!("Settings update error: {e}"))?;

    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('whisper_model_name', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')",
        rusqlite::params![model_id],
    )
    .map_err(|e| format!("Settings update error: {e}"))?;

    let binary_path: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'whisper_binary_path'",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .ok();

    let is_available = binary_path
        .as_deref()
        .map(whisper::check_binary)
        .unwrap_or(false);

    Ok(WhisperInfo {
        is_available,
        binary_path,
        model_path: Some(model_path.to_string_lossy().to_string()),
        model_name: Some(model_id),
    })
}

// ── Row Mappers ────────────────────────────────────────────

fn map_session_row(row: &rusqlite::Row) -> rusqlite::Result<CaptionSession> {
    Ok(CaptionSession {
        id: row.get(0)?,
        language: row.get(1)?,
        source_type: row.get(2)?,
        source_file: row.get(3)?,
        device_name: row.get(4)?,
        whisper_model: row.get(5)?,
        duration_seconds: row.get(6)?,
        segment_count: row.get(7)?,
        word_count: row.get(8)?,
        status: row.get(9)?,
        error_message: row.get(10)?,
        created_at: row.get(11)?,
        completed_at: row.get(12)?,
    })
}

fn map_segment_row(row: &rusqlite::Row) -> rusqlite::Result<CaptionSegment> {
    let word_ts_json: String = row.get(7)?;
    let word_timestamps: Vec<WordTimestamp> =
        serde_json::from_str(&word_ts_json).unwrap_or_default();

    Ok(CaptionSegment {
        id: row.get(0)?,
        session_id: row.get(1)?,
        text: row.get(2)?,
        language: row.get(3)?,
        confidence: row.get(4)?,
        start_time_ms: row.get(5)?,
        end_time_ms: row.get(6)?,
        word_timestamps,
        created_at: row.get(8)?,
    })
}

// ── Internal Helpers ───────────────────────────────────────

fn get_session_by_id(
    state: &State<'_, AppState>,
    id: &str,
) -> Result<CaptionSession, String> {
    let conn = lock_db(state)?;
    conn.query_row(
        "SELECT id, language, source_type, source_file, device_name,
                whisper_model, duration_seconds, segment_count, word_count,
                status, error_message, created_at, completed_at
         FROM caption_sessions WHERE id = ?1",
        rusqlite::params![id],
        map_session_row,
    )
    .map_err(|e| format!("Session not found: {e}"))
}

fn get_segments_by_session(
    state: &State<'_, AppState>,
    session_id: &str,
) -> Result<Vec<CaptionSegment>, String> {
    let conn = lock_db(state)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, text, language, confidence,
                    start_time_ms, end_time_ms, word_timestamps, created_at
             FROM caption_segments
             WHERE session_id = ?1
             ORDER BY start_time_ms ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![session_id], map_segment_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut segments = Vec::new();
    for row in rows {
        segments.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(segments)
}
