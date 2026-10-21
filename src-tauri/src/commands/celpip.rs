use tauri::State;

use crate::ai::json_extractor::extract_json;
use crate::ai::provider::{chat_completion, read_ai_settings, ChatMessage};
use crate::caption::{audio, whisper};
use crate::celpip::{prompts, InsightSkill};
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

// ── Section drafts ───────────────────────────────────────────────────────────
//
// Front keeps these in localStorage (`exam_draft_{sessionId}_{section}`). A
// desktop app can be force-quit, so they go to SQLite with the same payload
// shape — an exam in progress must survive a crash.

#[tauri::command]
pub fn celpip_save_draft(
    state: State<'_, AppState>,
    session_id: String,
    section: String,
    payload: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "INSERT INTO celpip_drafts (session_id, section, payload, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(session_id, section) DO UPDATE SET
            payload = excluded.payload, updated_at = datetime('now')",
        rusqlite::params![session_id, section, payload],
    )
    .map_err(|e| format!("Draft save failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn celpip_load_draft(
    state: State<'_, AppState>,
    session_id: String,
    section: String,
) -> Result<Option<String>, String> {
    let conn = lock_db(&state)?;
    Ok(conn
        .query_row(
            "SELECT payload FROM celpip_drafts WHERE session_id = ?1 AND section = ?2",
            rusqlite::params![session_id, section],
            |row| row.get(0),
        )
        .ok())
}

#[tauri::command]
pub fn celpip_clear_draft(
    state: State<'_, AppState>,
    session_id: String,
    section: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM celpip_drafts WHERE session_id = ?1 AND section = ?2",
        rusqlite::params![session_id, section],
    )
    .map_err(|e| format!("Draft clear failed: {e}"))?;
    Ok(())
}

/// Ending an exam early clears every section's draft at once.
#[tauri::command]
pub fn celpip_clear_all_drafts(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM celpip_drafts WHERE session_id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| format!("Draft clear failed: {e}"))?;
    Ok(())
}

// ── Speaking: record → transcribe → upload ───────────────────────────────────

#[derive(serde::Serialize)]
pub struct CelpipRecording {
    pub local_path: String,
    pub duration_sec: i64,
}

fn recordings_dir(session_id: &str) -> Result<std::path::PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or("Cannot determine data directory")?
        .join("com.flexilingo.desk")
        .join("celpip")
        .join(session_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create recordings dir: {e}"))?;
    Ok(dir)
}

#[tauri::command]
pub fn celpip_record_start(
    state: State<'_, AppState>,
    session_id: String,
    task_key: String,
    device_id: Option<String>,
) -> Result<(), String> {
    // Starting a second recording would silently orphan the first.
    if state
        .celpip_recording
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?
        .is_some()
    {
        return Err("RECORDING_ALREADY_ACTIVE".to_string());
    }

    let path = recordings_dir(&session_id)?.join(format!("{task_key}.wav"));
    let handle = audio::start_recording(device_id.as_deref(), path.clone())?;

    *state
        .celpip_recording
        .lock()
        .map_err(|e| format!("Lock error: {e}"))? = Some((handle, path));
    Ok(())
}

#[tauri::command]
pub fn celpip_record_stop(
    state: State<'_, AppState>,
    session_id: String,
    task_key: String,
) -> Result<CelpipRecording, String> {
    let (handle, path) = state
        .celpip_recording
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?
        .take()
        .ok_or("NO_ACTIVE_RECORDING")?;

    let result = handle.stop()?;
    let local_path = path.to_string_lossy().to_string();

    {
        let conn = lock_db(&state)?;
        conn.execute(
            "INSERT INTO celpip_recordings (session_id, task_key, local_path, duration_sec)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(session_id, task_key) DO UPDATE SET
                local_path = excluded.local_path,
                duration_sec = excluded.duration_sec,
                transcript = NULL,
                audio_url = NULL",
            rusqlite::params![session_id, task_key, local_path, result.duration_seconds],
        )
        .map_err(|e| format!("Recording save failed: {e}"))?;
    }

    Ok(CelpipRecording {
        local_path,
        duration_sec: result.duration_seconds,
    })
}

/// Cancels an in-flight recording without saving it (mic error, user aborted).
#[tauri::command]
pub fn celpip_record_cancel(state: State<'_, AppState>) -> Result<(), String> {
    if let Some((handle, path)) = state
        .celpip_recording
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?
        .take()
    {
        let _ = handle.stop();
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

/// Transcribes a speaking answer with the LOCAL Whisper model.
///
/// The cloud transcribes uploaded audio at `complete_exam` too, but sending our
/// own transcript alongside it means a worker outage can never zero a speaking
/// score — the backend falls back to the client transcript.
#[tauri::command]
pub async fn celpip_transcribe_recording(
    state: State<'_, AppState>,
    session_id: String,
    task_key: String,
) -> Result<String, String> {
    let (local_path, binary, model) = {
        let conn = lock_db(&state)?;
        let local_path: String = conn
            .query_row(
                "SELECT local_path FROM celpip_recordings WHERE session_id = ?1 AND task_key = ?2",
                rusqlite::params![session_id, task_key],
                |row| row.get(0),
            )
            .map_err(|_| "RECORDING_NOT_FOUND".to_string())?;

        let binary: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'whisper_binary_path'",
                [],
                |row| row.get(0),
            )
            .map_err(|_| "WHISPER_NOT_CONFIGURED".to_string())?;
        let model: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'whisper_model_path'",
                [],
                |row| row.get(0),
            )
            .map_err(|_| "WHISPER_NOT_CONFIGURED".to_string())?;

        (local_path, binary, model)
    };

    // CELPIP is an English exam; pinning the language beats auto-detection on
    // short, accented answers.
    let segments = whisper::transcribe_file(&binary, &model, &local_path, "en").await?;
    let transcript = segments
        .iter()
        .map(|s| s.text.trim())
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE celpip_recordings SET transcript = ?3 WHERE session_id = ?1 AND task_key = ?2",
        rusqlite::params![session_id, task_key, transcript],
    )
    .map_err(|e| format!("Transcript save failed: {e}"))?;

    Ok(transcript)
}

/// Uploads a speaking answer to the `user-recordings` bucket and returns its
/// public URL, which goes into `submit_section` as the task's answer.
///
/// Path layout matches web and mobile exactly: `{user_id}/celpip/{session_id}/…`.
/// Storage RLS only permits writes under the caller's own user id.
#[tauri::command]
pub async fn celpip_upload_recording(
    state: State<'_, AppState>,
    session_id: String,
    task_key: String,
) -> Result<String, String> {
    let session = crate::auth::stored_session(&state).ok_or("UNAUTHORIZED")?;

    let local_path: String = {
        let conn = lock_db(&state)?;
        conn.query_row(
            "SELECT local_path FROM celpip_recordings WHERE session_id = ?1 AND task_key = ?2",
            rusqlite::params![session_id, task_key],
            |row| row.get(0),
        )
        .map_err(|_| "RECORDING_NOT_FOUND".to_string())?
    };

    let bytes = std::fs::read(&local_path).map_err(|e| format!("Cannot read recording: {e}"))?;
    if bytes.is_empty() {
        return Err("EMPTY_RECORDING".to_string());
    }

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Clock error: {e}"))?
        .as_millis();
    let object_path = format!(
        "{}/celpip/{}/{}_{}.wav",
        session.user_id, session_id, task_key, stamp
    );

    let url = crate::auth::storage_upload(
        &session.access_token,
        "user-recordings",
        &object_path,
        "audio/wav",
        bytes,
    )
    .await?;

    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE celpip_recordings SET audio_url = ?3 WHERE session_id = ?1 AND task_key = ?2",
        rusqlite::params![session_id, task_key, url],
    )
    .map_err(|e| format!("Upload record failed: {e}"))?;

    Ok(url)
}

// ── Local AI insight (the free-tier alternative to FlexiLingo's) ──────────────

#[derive(serde::Serialize)]
pub struct LocalInsightRow {
    pub skill: String,
    pub status: String,
    pub result: Option<String>,
    pub error: Option<String>,
}

/// Every locally-generated insight for a session, so the results screen can
/// rebuild its state machine after a restart.
#[tauri::command]
pub fn celpip_local_insight_all(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<LocalInsightRow>, String> {
    let conn = lock_db(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT skill, status, result, error FROM celpip_local_insight WHERE session_id = ?1",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![session_id], |row| {
            Ok(LocalInsightRow {
                skill: row.get(0)?,
                status: row.get(1)?,
                result: row.get(2)?,
                error: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))
}

#[tauri::command]
pub fn celpip_clear_local_insight(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM celpip_local_insight WHERE session_id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| format!("Clear failed: {e}"))?;
    Ok(())
}

/// Generates one skill's insight with the on-device model and caches it.
///
/// `context` is the JSON the frontend assembled from the results payload. The
/// returned string is the same JSON fragment the cloud would have returned for
/// that skill, so the UI renders it without branching.
#[tauri::command]
pub async fn celpip_generate_local_insight(
    state: State<'_, AppState>,
    session_id: String,
    skill: String,
    context: String,
    clb_score: Option<f64>,
) -> Result<String, String> {
    let skill_enum = InsightSkill::parse(&skill)?;

    // Phase 1: cached? Read settings. Drop the guard before the await.
    let settings = {
        let conn = lock_db(&state)?;

        let cached: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT status, result FROM celpip_local_insight WHERE session_id = ?1 AND skill = ?2",
                rusqlite::params![session_id, skill],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        if let Some((status, Some(result))) = cached {
            if status == "ready" {
                return Ok(result);
            }
        }

        conn.execute(
            "INSERT INTO celpip_local_insight (session_id, skill, status, error, updated_at)
             VALUES (?1, ?2, 'generating', NULL, datetime('now'))
             ON CONFLICT(session_id, skill) DO UPDATE SET
                status = 'generating', error = NULL, updated_at = datetime('now')",
            rusqlite::params![session_id, skill],
        )
        .map_err(|e| format!("Claim failed: {e}"))?;

        read_ai_settings(&conn)
    };

    // Phase 2: the model call — no DB lock held.
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: prompts::system_prompt().to_string(),
        },
        ChatMessage {
            role: "user".into(),
            content: prompts::user_prompt(skill_enum, &context, clb_score),
        },
    ];

    let raw = chat_completion(
        &settings.provider,
        &settings.model,
        messages,
        settings.api_key.as_deref(),
        settings.base_url.as_deref(),
        Some(0.2),
        Some(2048),
        true,
    )
    .await;

    // Phase 3: persist the outcome, success or failure.
    // The model may wrap its JSON in prose or a code fence; `extract_json` digs it out.
    let parsed = raw.and_then(|r| extract_json(&r).map_err(|_| "MODEL_RETURNED_NO_JSON".to_string()));

    match parsed.map(|v| v.to_string()) {
        Ok(json) => {
            let conn = lock_db(&state)?;
            conn.execute(
                "UPDATE celpip_local_insight
                    SET status = 'ready', result = ?3, error = NULL, updated_at = datetime('now')
                  WHERE session_id = ?1 AND skill = ?2",
                rusqlite::params![session_id, skill, json],
            )
            .map_err(|e| format!("Insight save failed: {e}"))?;
            Ok(json)
        }
        Err(err) => {
            let conn = lock_db(&state)?;
            conn.execute(
                "UPDATE celpip_local_insight
                    SET status = 'error', error = ?3, updated_at = datetime('now')
                  WHERE session_id = ?1 AND skill = ?2",
                rusqlite::params![session_id, skill, err],
            )
            .ok();
            Err(err)
        }
    }
}
