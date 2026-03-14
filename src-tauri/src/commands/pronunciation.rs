use tauri::State;

use crate::caption::audio;
use crate::caption::whisper;
use crate::pronunciation::analysis;
use crate::pronunciation::types::*;
use crate::AppState;

// ── Helpers ─────────────────────────────────────────────

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

// ── Session Commands ────────────────────────────────────

#[tauri::command]
pub fn pronunciation_create_session(
    state: State<'_, AppState>,
    mode: String,
    language: String,
    target_text: String,
) -> Result<PronunciationSession, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO pronunciation_sessions (id, mode, language, target_text, status)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, 'idle')",
        rusqlite::params![mode, language, target_text],
    )
    .map_err(|e| format!("Session create error: {e}"))?;

    let id: String = conn
        .query_row(
            "SELECT id FROM pronunciation_sessions ORDER BY created_at DESC LIMIT 1",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?;

    get_session_by_id_inner(&conn, &id)
}

#[tauri::command]
pub fn pronunciation_list_sessions(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<PronunciationSession>, String> {
    let conn = lock_db(&state)?;
    let max = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT id, mode, language, target_text, reference_audio, status,
                    overall_score, phoneme_score, prosody_score, fluency_score,
                    feedback_json, attempts, best_score, error_message,
                    created_at, completed_at
             FROM pronunciation_sessions
             ORDER BY created_at DESC LIMIT ?1",
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
pub fn pronunciation_get_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<PronunciationSession, String> {
    let conn = lock_db(&state)?;
    get_session_by_id_inner(&conn, &id)
}

#[tauri::command]
pub fn pronunciation_delete_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;

    // Delete attempt audio files
    let mut stmt = conn
        .prepare("SELECT audio_path FROM pronunciation_attempts WHERE session_id = ?1")
        .map_err(|e| format!("Query error: {e}"))?;

    let paths: Vec<String> = stmt
        .query_map(rusqlite::params![id], |row: &rusqlite::Row| row.get(0))
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    for path in paths {
        let _ = std::fs::remove_file(&path);
    }

    conn.execute(
        "DELETE FROM pronunciation_sessions WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;

    Ok(())
}

// ── Recording + Analysis ────────────────────────────────

#[tauri::command]
pub fn pronunciation_record_attempt(
    state: State<'_, AppState>,
    session_id: String,
    device_id: Option<String>,
) -> Result<PronunciationAttempt, String> {
    // Get session info
    let (target_text, attempt_num) = {
        let conn = lock_db(&state)?;
        let target: String = conn
            .query_row(
                "SELECT target_text FROM pronunciation_sessions WHERE id = ?1",
                rusqlite::params![session_id],
                |row: &rusqlite::Row| row.get(0),
            )
            .map_err(|e| format!("Session not found: {e}"))?;

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pronunciation_attempts WHERE session_id = ?1",
                rusqlite::params![session_id],
                |row: &rusqlite::Row| row.get(0),
            )
            .map_err(|e| format!("Count error: {e}"))?;

        (target, count + 1)
    };

    // Build WAV path
    let data_dir = dirs::data_dir()
        .ok_or("Cannot determine data directory")?
        .join("com.flexilingo.desk")
        .join("pronunciation");

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create pronunciation dir: {e}"))?;

    let wav_path = data_dir.join(format!("{session_id}_{attempt_num}.wav"));

    // Update session status
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE pronunciation_sessions SET status = 'recording' WHERE id = ?1",
            rusqlite::params![session_id],
        )
        .map_err(|e| format!("Status update error: {e}"))?;
    }

    // Record audio (blocking — cpal runs on a thread internally)
    let handle = audio::start_recording(device_id.as_deref(), wav_path.clone())?;

    // For pronunciation we use a fixed short recording.
    // The frontend will call pronunciation_stop_and_analyze to stop.
    // Store the handle temporarily. But since we can't easily hold handles across
    // IPC calls without complex state, we'll do a simulated short capture.
    // In practice, the frontend manages the timing and calls stop.

    // For now, store handle in caption engine state temporarily
    {
        let mut caption = state
            .caption
            .lock()
            .map_err(|e| format!("Caption lock error: {e}"))?;
        caption.recording = Some(handle);
        caption.recording_path = Some(wav_path.clone());
    }

    // Create attempt record (will be updated after analysis)
    let conn = lock_db(&state)?;
    conn.execute(
        "INSERT INTO pronunciation_attempts (id, session_id, attempt_number, audio_path)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3)",
        rusqlite::params![session_id, attempt_num, wav_path.to_string_lossy().to_string()],
    )
    .map_err(|e| format!("Attempt create error: {e}"))?;

    let attempt_id: String = conn
        .query_row(
            "SELECT id FROM pronunciation_attempts WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 1",
            rusqlite::params![session_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Attempt lookup error: {e}"))?;

    let _ = target_text; // used later in analysis

    get_attempt_by_id(&conn, &attempt_id)
}

#[tauri::command]
pub async fn pronunciation_stop_and_analyze(
    state: State<'_, AppState>,
    session_id: String,
    attempt_id: String,
) -> Result<PronunciationAttempt, String> {
    // 1. Stop recording
    let (audio_path, recording_result) = {
        let mut caption = state
            .caption
            .lock()
            .map_err(|e| format!("Caption lock error: {e}"))?;

        let handle = caption
            .recording
            .take()
            .ok_or("No active recording")?;

        let path = caption
            .recording_path
            .take()
            .ok_or("No recording path")?;

        let result = handle.stop()?;
        (path, result)
    };

    // 2. Get target text and whisper config
    let (target_text, language, binary_path, model_path) = {
        let conn = lock_db(&state)?;

        let (target, lang): (String, String) = conn
            .query_row(
                "SELECT target_text, language FROM pronunciation_sessions WHERE id = ?1",
                rusqlite::params![session_id],
                |row: &rusqlite::Row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Session not found: {e}"))?;

        let bin: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'whisper_binary_path'",
                [],
                |row: &rusqlite::Row| row.get(0),
            )
            .map_err(|_| "Whisper not configured".to_string())?;

        let model: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'whisper_model_path'",
                [],
                |row: &rusqlite::Row| row.get(0),
            )
            .map_err(|_| "Whisper model not configured".to_string())?;

        (target, lang, bin, model)
    };

    // 3. Transcribe with Whisper
    let audio_str = audio_path.to_string_lossy().to_string();
    let segments = whisper::transcribe_file(&binary_path, &model_path, &audio_str, &language).await?;

    let transcript = segments
        .iter()
        .map(|s| s.text.clone())
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();

    // 4. Run analysis
    let result = analysis::analyze_pronunciation(&target_text, &transcript);

    let word_scores_json =
        serde_json::to_string(&result.word_scores).unwrap_or_else(|_| "[]".into());

    // 5. Update attempt
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "UPDATE pronunciation_attempts SET
                duration_ms = ?1,
                transcript = ?2,
                overall_score = ?3,
                phoneme_score = ?4,
                prosody_score = ?5,
                fluency_score = ?6,
                word_scores_json = ?7
             WHERE id = ?8",
            rusqlite::params![
                recording_result.duration_seconds * 1000,
                transcript,
                result.overall_score,
                result.phoneme_score,
                result.prosody_score,
                result.fluency_score,
                word_scores_json,
                attempt_id,
            ],
        )
        .map_err(|e| format!("Attempt update error: {e}"))?;

        // 6. Update session with best scores
        let feedback_json =
            serde_json::to_string(&result.feedback).unwrap_or_else(|_| "{}".into());

        conn.execute(
            "UPDATE pronunciation_sessions SET
                status = 'completed',
                overall_score = MAX(COALESCE(overall_score, 0), ?1),
                phoneme_score = ?2,
                prosody_score = ?3,
                fluency_score = ?4,
                feedback_json = ?5,
                attempts = attempts + 1,
                best_score = MAX(COALESCE(best_score, 0), ?1),
                completed_at = datetime('now')
             WHERE id = ?6",
            rusqlite::params![
                result.overall_score,
                result.phoneme_score,
                result.prosody_score,
                result.fluency_score,
                feedback_json,
                session_id,
            ],
        )
        .map_err(|e| format!("Session update error: {e}"))?;

        // 7. Update progress
        conn.execute(
            "INSERT INTO pronunciation_progress (id, language, total_sessions, total_attempts, average_score, best_score, practice_minutes)
             VALUES (lower(hex(randomblob(16))), ?1, 1, 1, ?2, ?2, ?3)
             ON CONFLICT(language) DO UPDATE SET
                total_attempts = total_attempts + 1,
                average_score = (average_score * total_attempts + ?2) / (total_attempts + 1),
                best_score = MAX(best_score, ?2),
                practice_minutes = practice_minutes + ?3,
                updated_at = datetime('now')",
            rusqlite::params![
                language,
                result.overall_score,
                (recording_result.duration_seconds / 60).max(1),
            ],
        )
        .map_err(|e| format!("Progress update error: {e}"))?;
    }

    let conn = lock_db(&state)?;
    get_attempt_by_id(&conn, &attempt_id)
}

// ── Attempt Queries ─────────────────────────────────────

#[tauri::command]
pub fn pronunciation_get_attempts(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<PronunciationAttempt>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, attempt_number, audio_path, duration_ms,
                    transcript, overall_score, phoneme_score, prosody_score,
                    fluency_score, word_scores_json, created_at
             FROM pronunciation_attempts
             WHERE session_id = ?1
             ORDER BY attempt_number ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![session_id], map_attempt_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut attempts = Vec::new();
    for row in rows {
        attempts.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(attempts)
}

// ── Progress ────────────────────────────────────────────

#[tauri::command]
pub fn pronunciation_get_progress(
    state: State<'_, AppState>,
    language: Option<String>,
) -> Result<Vec<PronunciationProgress>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = if let Some(ref lang) = language {
        let mut s = conn
            .prepare(
                "SELECT id, language, total_sessions, total_attempts, average_score,
                        best_score, practice_minutes, weak_phonemes, updated_at
                 FROM pronunciation_progress
                 WHERE language = ?1",
            )
            .map_err(|e| format!("Query error: {e}"))?;
        let rows = s
            .query_map(rusqlite::params![lang], map_progress_row)
            .map_err(|e| format!("Query error: {e}"))?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| format!("Row error: {e}"))?);
        }
        return Ok(result);
    } else {
        conn.prepare(
            "SELECT id, language, total_sessions, total_attempts, average_score,
                    best_score, practice_minutes, weak_phonemes, updated_at
             FROM pronunciation_progress
             ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("Query error: {e}"))?
    };

    let rows = stmt
        .query_map([], map_progress_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(result)
}

// ── Row Mappers ─────────────────────────────────────────

fn map_session_row(row: &rusqlite::Row) -> rusqlite::Result<PronunciationSession> {
    Ok(PronunciationSession {
        id: row.get(0)?,
        mode: row.get(1)?,
        language: row.get(2)?,
        target_text: row.get(3)?,
        reference_audio: row.get(4)?,
        status: row.get(5)?,
        overall_score: row.get(6)?,
        phoneme_score: row.get(7)?,
        prosody_score: row.get(8)?,
        fluency_score: row.get(9)?,
        feedback_json: row.get::<_, Option<String>>(10)?.unwrap_or_else(|| "{}".into()),
        attempts: row.get(11)?,
        best_score: row.get(12)?,
        error_message: row.get(13)?,
        created_at: row.get(14)?,
        completed_at: row.get(15)?,
    })
}

fn map_attempt_row(row: &rusqlite::Row) -> rusqlite::Result<PronunciationAttempt> {
    Ok(PronunciationAttempt {
        id: row.get(0)?,
        session_id: row.get(1)?,
        attempt_number: row.get(2)?,
        audio_path: row.get(3)?,
        duration_ms: row.get(4)?,
        transcript: row.get(5)?,
        overall_score: row.get(6)?,
        phoneme_score: row.get(7)?,
        prosody_score: row.get(8)?,
        fluency_score: row.get(9)?,
        word_scores_json: row.get::<_, Option<String>>(10)?.unwrap_or_else(|| "[]".into()),
        created_at: row.get(11)?,
    })
}

fn map_progress_row(row: &rusqlite::Row) -> rusqlite::Result<PronunciationProgress> {
    Ok(PronunciationProgress {
        id: row.get(0)?,
        language: row.get(1)?,
        total_sessions: row.get(2)?,
        total_attempts: row.get(3)?,
        average_score: row.get(4)?,
        best_score: row.get(5)?,
        practice_minutes: row.get(6)?,
        weak_phonemes: row.get::<_, Option<String>>(7)?.unwrap_or_else(|| "[]".into()),
        updated_at: row.get(8)?,
    })
}

// ── Internal Helpers ────────────────────────────────────

fn get_session_by_id_inner(
    conn: &rusqlite::Connection,
    id: &str,
) -> Result<PronunciationSession, String> {
    conn.query_row(
        "SELECT id, mode, language, target_text, reference_audio, status,
                overall_score, phoneme_score, prosody_score, fluency_score,
                feedback_json, attempts, best_score, error_message,
                created_at, completed_at
         FROM pronunciation_sessions WHERE id = ?1",
        rusqlite::params![id],
        map_session_row,
    )
    .map_err(|e| format!("Session not found: {e}"))
}

fn get_attempt_by_id(
    conn: &rusqlite::Connection,
    id: &str,
) -> Result<PronunciationAttempt, String> {
    conn.query_row(
        "SELECT id, session_id, attempt_number, audio_path, duration_ms,
                transcript, overall_score, phoneme_score, prosody_score,
                fluency_score, word_scores_json, created_at
         FROM pronunciation_attempts WHERE id = ?1",
        rusqlite::params![id],
        map_attempt_row,
    )
    .map_err(|e| format!("Attempt not found: {e}"))
}
