use serde::{Deserialize, Serialize};
use tauri::State;

use crate::writing::types::*;
use crate::AppState;

// ── Helpers ─────────────────────────────────────────────

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

// ── Session Commands ────────────────────────────────────

#[tauri::command]
pub fn writing_create_session(
    state: State<'_, AppState>,
    title: String,
    language: String,
    task_type: String,
    prompt_text: Option<String>,
    target_words: Option<i64>,
    time_limit_min: Option<i64>,
) -> Result<WritingSession, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO writing_sessions
            (id, title, language, task_type, prompt_text, target_words, time_limit_min)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![title, language, task_type, prompt_text, target_words, time_limit_min],
    )
    .map_err(|e| format!("Session create error: {e}"))?;

    let id: String = conn
        .query_row(
            "SELECT id FROM writing_sessions ORDER BY created_at DESC LIMIT 1",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?;

    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn writing_list_sessions(
    state: State<'_, AppState>,
    language: Option<String>,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<WritingSession>, String> {
    let conn = lock_db(&state)?;
    let max = limit.unwrap_or(50);

    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match (&language, &status) {
        (Some(lang), Some(st)) => (
            format!(
                "SELECT {} FROM writing_sessions WHERE language = ?1 AND status = ?2 ORDER BY updated_at DESC LIMIT ?3",
                SESSION_COLS
            ),
            vec![
                Box::new(lang.clone()) as Box<dyn rusqlite::types::ToSql>,
                Box::new(st.clone()),
                Box::new(max),
            ],
        ),
        (Some(lang), None) => (
            format!(
                "SELECT {} FROM writing_sessions WHERE language = ?1 ORDER BY updated_at DESC LIMIT ?2",
                SESSION_COLS
            ),
            vec![
                Box::new(lang.clone()) as Box<dyn rusqlite::types::ToSql>,
                Box::new(max),
            ],
        ),
        (None, Some(st)) => (
            format!(
                "SELECT {} FROM writing_sessions WHERE status = ?1 ORDER BY updated_at DESC LIMIT ?2",
                SESSION_COLS
            ),
            vec![
                Box::new(st.clone()) as Box<dyn rusqlite::types::ToSql>,
                Box::new(max),
            ],
        ),
        (None, None) => (
            format!(
                "SELECT {} FROM writing_sessions ORDER BY updated_at DESC LIMIT ?1",
                SESSION_COLS
            ),
            vec![Box::new(max) as Box<dyn rusqlite::types::ToSql>],
        ),
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {e}"))?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt
        .query_map(params_refs.as_slice(), map_session_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(sessions)
}

#[tauri::command]
pub fn writing_get_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<WritingSession, String> {
    let conn = lock_db(&state)?;
    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn writing_update_text(
    state: State<'_, AppState>,
    id: String,
    text: String,
) -> Result<WritingSession, String> {
    let conn = lock_db(&state)?;
    let word_count = text.split_whitespace().count() as i64;

    conn.execute(
        "UPDATE writing_sessions
         SET original_text = ?1, word_count = ?2, status = 'writing', updated_at = datetime('now')
         WHERE id = ?3",
        rusqlite::params![text, word_count, id],
    )
    .map_err(|e| format!("Update error: {e}"))?;

    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn writing_submit(
    state: State<'_, AppState>,
    id: String,
) -> Result<WritingSession, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "UPDATE writing_sessions
         SET status = 'submitted', submitted_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?1 AND status IN ('draft', 'writing')",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Submit error: {e}"))?;

    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn writing_update_elapsed(
    state: State<'_, AppState>,
    id: String,
    elapsed_seconds: i64,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE writing_sessions SET elapsed_seconds = ?1 WHERE id = ?2",
        rusqlite::params![elapsed_seconds, id],
    )
    .map_err(|e| format!("Update elapsed error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn writing_save_corrections(
    state: State<'_, AppState>,
    id: String,
    corrected_text: String,
    corrections: Vec<CorrectionInput>,
    overall_score: Option<f64>,
    grammar_score: Option<f64>,
    vocabulary_score: Option<f64>,
    coherence_score: Option<f64>,
    task_score: Option<f64>,
    band_score: Option<String>,
    feedback_json: Option<String>,
    grammar_patterns_json: Option<String>,
    cefr_level: Option<String>,
) -> Result<WritingSession, String> {
    let conn = lock_db(&state)?;

    // Update session with scores and corrected text
    let corrections_json = serde_json::to_string(&corrections).unwrap_or_else(|_| "[]".into());

    conn.execute(
        "UPDATE writing_sessions SET
            corrected_text = ?1,
            corrections_json = ?2,
            overall_score = ?3,
            grammar_score = ?4,
            vocabulary_score = ?5,
            coherence_score = ?6,
            task_score = ?7,
            band_score = ?8,
            feedback_json = ?9,
            grammar_patterns_json = ?10,
            cefr_level = ?11,
            status = 'scored',
            completed_at = datetime('now'),
            updated_at = datetime('now')
         WHERE id = ?12",
        rusqlite::params![
            corrected_text,
            corrections_json,
            overall_score,
            grammar_score,
            vocabulary_score,
            coherence_score,
            task_score,
            band_score,
            feedback_json.unwrap_or_else(|| "{}".into()),
            grammar_patterns_json.unwrap_or_else(|| "[]".into()),
            cefr_level,
            id,
        ],
    )
    .map_err(|e| format!("Save corrections error: {e}"))?;

    // Insert individual corrections
    for c in &corrections {
        conn.execute(
            "INSERT INTO writing_corrections
                (id, session_id, original_span, corrected_span, error_type,
                 explanation, start_offset, end_offset, severity)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                id,
                c.original_span,
                c.corrected_span,
                c.error_type,
                c.explanation,
                c.start_offset,
                c.end_offset,
                c.severity,
            ],
        )
        .map_err(|e| format!("Insert correction error: {e}"))?;
    }

    // Update stats
    update_stats(&conn, &id)?;

    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn writing_get_corrections(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<WritingCorrection>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, original_span, corrected_span, error_type,
                    explanation, start_offset, end_offset, severity, created_at
             FROM writing_corrections
             WHERE session_id = ?1
             ORDER BY start_offset ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![session_id], map_correction_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut corrections = Vec::new();
    for row in rows {
        corrections.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(corrections)
}

#[tauri::command]
pub fn writing_delete_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM writing_sessions WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

// ── Prompt Commands ─────────────────────────────────────

#[tauri::command]
pub fn writing_list_prompts(
    state: State<'_, AppState>,
    task_type: Option<String>,
    language: Option<String>,
) -> Result<Vec<WritingPrompt>, String> {
    let conn = lock_db(&state)?;

    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match (&task_type, &language) {
        (Some(tt), Some(lang)) => (
            "SELECT id, task_type, language, title, description, target_words, time_limit_min, cefr_level, is_builtin, created_at
             FROM writing_prompts WHERE task_type = ?1 AND language = ?2 ORDER BY created_at DESC".into(),
            vec![Box::new(tt.clone()) as Box<dyn rusqlite::types::ToSql>, Box::new(lang.clone())],
        ),
        (Some(tt), None) => (
            "SELECT id, task_type, language, title, description, target_words, time_limit_min, cefr_level, is_builtin, created_at
             FROM writing_prompts WHERE task_type = ?1 ORDER BY created_at DESC".into(),
            vec![Box::new(tt.clone()) as Box<dyn rusqlite::types::ToSql>],
        ),
        (None, Some(lang)) => (
            "SELECT id, task_type, language, title, description, target_words, time_limit_min, cefr_level, is_builtin, created_at
             FROM writing_prompts WHERE language = ?1 ORDER BY created_at DESC".into(),
            vec![Box::new(lang.clone()) as Box<dyn rusqlite::types::ToSql>],
        ),
        (None, None) => (
            "SELECT id, task_type, language, title, description, target_words, time_limit_min, cefr_level, is_builtin, created_at
             FROM writing_prompts ORDER BY created_at DESC".into(),
            vec![],
        ),
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {e}"))?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt
        .query_map(params_refs.as_slice(), map_prompt_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut prompts = Vec::new();
    for row in rows {
        prompts.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(prompts)
}

#[tauri::command]
pub fn writing_create_prompt(
    state: State<'_, AppState>,
    task_type: String,
    language: String,
    title: String,
    description: String,
    target_words: Option<i64>,
    time_limit_min: Option<i64>,
    cefr_level: Option<String>,
) -> Result<WritingPrompt, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO writing_prompts
            (id, task_type, language, title, description, target_words, time_limit_min, cefr_level)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![task_type, language, title, description, target_words, time_limit_min, cefr_level],
    )
    .map_err(|e| format!("Prompt create error: {e}"))?;

    let id: String = conn
        .query_row(
            "SELECT id FROM writing_prompts ORDER BY created_at DESC LIMIT 1",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Prompt lookup error: {e}"))?;

    conn.query_row(
        "SELECT id, task_type, language, title, description, target_words, time_limit_min, cefr_level, is_builtin, created_at
         FROM writing_prompts WHERE id = ?1",
        rusqlite::params![id],
        map_prompt_row,
    )
    .map_err(|e| format!("Prompt not found: {e}"))
}

#[tauri::command]
pub fn writing_delete_prompt(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM writing_prompts WHERE id = ?1 AND is_builtin = 0",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

// ── Stats Commands ──────────────────────────────────────

#[tauri::command]
pub fn writing_get_stats(
    state: State<'_, AppState>,
    language: String,
) -> Result<WritingStats, String> {
    let conn = lock_db(&state)?;

    conn.query_row(
        "SELECT id, language, total_sessions, total_words_written, average_score,
                best_score, total_corrections, common_errors_json, updated_at
         FROM writing_stats WHERE language = ?1",
        rusqlite::params![language],
        map_stats_row,
    )
    .or_else(|_| {
        // Return default stats if none exist
        Ok(WritingStats {
            id: String::new(),
            language: language.clone(),
            total_sessions: 0,
            total_words_written: 0,
            average_score: 0.0,
            best_score: 0.0,
            total_corrections: 0,
            common_errors_json: "[]".into(),
            updated_at: String::new(),
        })
    })
}

// ── Input Types ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorrectionInput {
    pub original_span: String,
    pub corrected_span: String,
    pub error_type: String,
    pub explanation: Option<String>,
    pub start_offset: i64,
    pub end_offset: i64,
    pub severity: String,
}

// ── Row Mappers ─────────────────────────────────────────

const SESSION_COLS: &str =
    "id, title, language, task_type, prompt_text, original_text, corrected_text,
     word_count, target_words, time_limit_min, elapsed_seconds, status,
     overall_score, grammar_score, vocabulary_score, coherence_score, task_score,
     band_score, feedback_json, corrections_json, grammar_patterns_json,
     cefr_level, error_message, created_at, updated_at, submitted_at, completed_at";

fn map_session_row(row: &rusqlite::Row) -> rusqlite::Result<WritingSession> {
    Ok(WritingSession {
        id: row.get(0)?,
        title: row.get(1)?,
        language: row.get(2)?,
        task_type: row.get(3)?,
        prompt_text: row.get(4)?,
        original_text: row.get(5)?,
        corrected_text: row.get(6)?,
        word_count: row.get(7)?,
        target_words: row.get(8)?,
        time_limit_min: row.get(9)?,
        elapsed_seconds: row.get(10)?,
        status: row.get(11)?,
        overall_score: row.get(12)?,
        grammar_score: row.get(13)?,
        vocabulary_score: row.get(14)?,
        coherence_score: row.get(15)?,
        task_score: row.get(16)?,
        band_score: row.get(17)?,
        feedback_json: row.get(18)?,
        corrections_json: row.get(19)?,
        grammar_patterns_json: row.get(20)?,
        cefr_level: row.get(21)?,
        error_message: row.get(22)?,
        created_at: row.get(23)?,
        updated_at: row.get(24)?,
        submitted_at: row.get(25)?,
        completed_at: row.get(26)?,
    })
}

fn map_correction_row(row: &rusqlite::Row) -> rusqlite::Result<WritingCorrection> {
    Ok(WritingCorrection {
        id: row.get(0)?,
        session_id: row.get(1)?,
        original_span: row.get(2)?,
        corrected_span: row.get(3)?,
        error_type: row.get(4)?,
        explanation: row.get(5)?,
        start_offset: row.get(6)?,
        end_offset: row.get(7)?,
        severity: row.get(8)?,
        created_at: row.get(9)?,
    })
}

fn map_prompt_row(row: &rusqlite::Row) -> rusqlite::Result<WritingPrompt> {
    Ok(WritingPrompt {
        id: row.get(0)?,
        task_type: row.get(1)?,
        language: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        target_words: row.get(5)?,
        time_limit_min: row.get(6)?,
        cefr_level: row.get(7)?,
        is_builtin: row.get::<_, i32>(8)? != 0,
        created_at: row.get(9)?,
    })
}

fn map_stats_row(row: &rusqlite::Row) -> rusqlite::Result<WritingStats> {
    Ok(WritingStats {
        id: row.get(0)?,
        language: row.get(1)?,
        total_sessions: row.get(2)?,
        total_words_written: row.get(3)?,
        average_score: row.get(4)?,
        best_score: row.get(5)?,
        total_corrections: row.get(6)?,
        common_errors_json: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

// ── Internal Helpers ────────────────────────────────────

fn get_session_by_id(conn: &rusqlite::Connection, id: &str) -> Result<WritingSession, String> {
    conn.query_row(
        &format!("SELECT {} FROM writing_sessions WHERE id = ?1", SESSION_COLS),
        rusqlite::params![id],
        map_session_row,
    )
    .map_err(|e| format!("Session not found: {e}"))
}

fn update_stats(conn: &rusqlite::Connection, session_id: &str) -> Result<(), String> {
    // Get the session language and score
    let (language, score, word_count, correction_count): (String, Option<f64>, i64, i64) = conn
        .query_row(
            "SELECT s.language, s.overall_score, s.word_count,
                    (SELECT COUNT(*) FROM writing_corrections WHERE session_id = s.id)
             FROM writing_sessions s WHERE s.id = ?1",
            rusqlite::params![session_id],
            |row: &rusqlite::Row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            },
        )
        .map_err(|e| format!("Stats lookup error: {e}"))?;

    // Upsert stats
    conn.execute(
        "INSERT INTO writing_stats (id, language, total_sessions, total_words_written, average_score, best_score, total_corrections)
         VALUES (lower(hex(randomblob(16))), ?1, 1, ?2, COALESCE(?3, 0), COALESCE(?3, 0), ?4)
         ON CONFLICT(language) DO UPDATE SET
            total_sessions = total_sessions + 1,
            total_words_written = total_words_written + ?2,
            average_score = CASE
                WHEN ?3 IS NOT NULL
                THEN (average_score * (total_sessions - 1) + ?3) / total_sessions
                ELSE average_score
            END,
            best_score = CASE
                WHEN ?3 IS NOT NULL AND ?3 > best_score THEN ?3
                ELSE best_score
            END,
            total_corrections = total_corrections + ?4,
            updated_at = datetime('now')",
        rusqlite::params![language, word_count, score, correction_count],
    )
    .map_err(|e| format!("Stats update error: {e}"))?;

    Ok(())
}
