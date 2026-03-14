use serde::{Deserialize, Serialize};
use tauri::State;

use crate::exam::types::*;
use crate::AppState;

// ── Helpers ─────────────────────────────────────────────

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

// ── Session Commands ────────────────────────────────────

#[tauri::command]
pub fn exam_create_session(
    state: State<'_, AppState>,
    exam_type: String,
    title: String,
    language: String,
    sections_json: String,
    total_sections: i64,
    total_questions: i64,
    time_limit_min: Option<i64>,
) -> Result<ExamSession, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO exam_sessions
            (id, exam_type, title, language, sections_json, total_sections,
             total_questions, time_limit_min)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            exam_type, title, language, sections_json,
            total_sections, total_questions, time_limit_min,
        ],
    )
    .map_err(|e| format!("Session create error: {e}"))?;

    let id: String = conn
        .query_row(
            "SELECT id FROM exam_sessions ORDER BY created_at DESC LIMIT 1",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?;

    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn exam_list_sessions(
    state: State<'_, AppState>,
    exam_type: Option<String>,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ExamSession>, String> {
    let conn = lock_db(&state)?;
    let max = limit.unwrap_or(50);

    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match (&exam_type, &status) {
        (Some(et), Some(st)) => (
            format!(
                "SELECT {} FROM exam_sessions WHERE exam_type = ?1 AND status = ?2 ORDER BY updated_at DESC LIMIT ?3",
                SESSION_COLS
            ),
            vec![
                Box::new(et.clone()) as Box<dyn rusqlite::types::ToSql>,
                Box::new(st.clone()),
                Box::new(max),
            ],
        ),
        (Some(et), None) => (
            format!(
                "SELECT {} FROM exam_sessions WHERE exam_type = ?1 ORDER BY updated_at DESC LIMIT ?2",
                SESSION_COLS
            ),
            vec![
                Box::new(et.clone()) as Box<dyn rusqlite::types::ToSql>,
                Box::new(max),
            ],
        ),
        (None, Some(st)) => (
            format!(
                "SELECT {} FROM exam_sessions WHERE status = ?1 ORDER BY updated_at DESC LIMIT ?2",
                SESSION_COLS
            ),
            vec![
                Box::new(st.clone()) as Box<dyn rusqlite::types::ToSql>,
                Box::new(max),
            ],
        ),
        (None, None) => (
            format!(
                "SELECT {} FROM exam_sessions ORDER BY updated_at DESC LIMIT ?1",
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
pub fn exam_get_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<ExamSession, String> {
    let conn = lock_db(&state)?;
    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn exam_start_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<ExamSession, String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE exam_sessions SET status = 'in_progress', started_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?1 AND status IN ('not_started', 'paused')",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Start error: {e}"))?;
    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn exam_pause_session(
    state: State<'_, AppState>,
    id: String,
    elapsed_seconds: i64,
) -> Result<ExamSession, String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE exam_sessions SET status = 'paused', elapsed_seconds = ?1, updated_at = datetime('now')
         WHERE id = ?2 AND status = 'in_progress'",
        rusqlite::params![elapsed_seconds, id],
    )
    .map_err(|e| format!("Pause error: {e}"))?;
    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn exam_complete_session(
    state: State<'_, AppState>,
    id: String,
    elapsed_seconds: i64,
    overall_score: Option<f64>,
    band_score: Option<String>,
    results_json: Option<String>,
    feedback_json: Option<String>,
) -> Result<ExamSession, String> {
    let conn = lock_db(&state)?;

    // Calculate correct count
    let correct_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exam_questions WHERE session_id = ?1 AND is_correct = 1",
            rusqlite::params![id],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or(0);

    let answered_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exam_questions WHERE session_id = ?1 AND user_answer IS NOT NULL",
            rusqlite::params![id],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "UPDATE exam_sessions SET
            status = 'completed',
            elapsed_seconds = ?1,
            overall_score = ?2,
            band_score = ?3,
            results_json = COALESCE(?4, results_json),
            feedback_json = COALESCE(?5, feedback_json),
            correct_count = ?6,
            answered_count = ?7,
            completed_at = datetime('now'),
            updated_at = datetime('now')
         WHERE id = ?8",
        rusqlite::params![
            elapsed_seconds, overall_score, band_score,
            results_json, feedback_json,
            correct_count, answered_count, id,
        ],
    )
    .map_err(|e| format!("Complete error: {e}"))?;

    // Update history
    update_exam_history(&conn, &id)?;

    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn exam_abandon_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE exam_sessions SET status = 'abandoned', updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Abandon error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn exam_delete_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM exam_sessions WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn exam_update_elapsed(
    state: State<'_, AppState>,
    id: String,
    elapsed_seconds: i64,
    current_section: Option<i64>,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    if let Some(section) = current_section {
        conn.execute(
            "UPDATE exam_sessions SET elapsed_seconds = ?1, current_section = ?2 WHERE id = ?3",
            rusqlite::params![elapsed_seconds, section, id],
        )
        .map_err(|e| format!("Update elapsed error: {e}"))?;
    } else {
        conn.execute(
            "UPDATE exam_sessions SET elapsed_seconds = ?1 WHERE id = ?2",
            rusqlite::params![elapsed_seconds, id],
        )
        .map_err(|e| format!("Update elapsed error: {e}"))?;
    }
    Ok(())
}

// ── Question Commands ───────────────────────────────────

#[tauri::command]
pub fn exam_add_questions(
    state: State<'_, AppState>,
    session_id: String,
    questions: Vec<QuestionInput>,
) -> Result<Vec<ExamQuestion>, String> {
    let conn = lock_db(&state)?;

    for q in &questions {
        let options_json = serde_json::to_string(&q.options).unwrap_or_else(|_| "[]".into());
        conn.execute(
            "INSERT INTO exam_questions
                (id, session_id, section_index, question_index, question_type,
                 prompt, context_text, audio_url, image_url, options_json,
                 correct_answer, max_score)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                session_id,
                q.section_index,
                q.question_index,
                q.question_type,
                q.prompt,
                q.context_text,
                q.audio_url,
                q.image_url,
                options_json,
                q.correct_answer,
                q.max_score.unwrap_or(1.0),
            ],
        )
        .map_err(|e| format!("Question insert error: {e}"))?;
    }

    get_questions_for_session(&conn, &session_id)
}

#[tauri::command]
pub fn exam_get_questions(
    state: State<'_, AppState>,
    session_id: String,
    section_index: Option<i64>,
) -> Result<Vec<ExamQuestion>, String> {
    let conn = lock_db(&state)?;

    if let Some(section) = section_index {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {} FROM exam_questions WHERE session_id = ?1 AND section_index = ?2 ORDER BY question_index",
                QUESTION_COLS
            ))
            .map_err(|e| format!("Query error: {e}"))?;

        let rows = stmt
            .query_map(rusqlite::params![session_id, section], map_question_row)
            .map_err(|e| format!("Query error: {e}"))?;

        let mut questions = Vec::new();
        for row in rows {
            questions.push(row.map_err(|e| format!("Row error: {e}"))?);
        }
        Ok(questions)
    } else {
        get_questions_for_session(&conn, &session_id)
    }
}

#[tauri::command]
pub fn exam_answer_question(
    state: State<'_, AppState>,
    question_id: String,
    user_answer: String,
    time_spent_sec: i64,
) -> Result<ExamQuestion, String> {
    let conn = lock_db(&state)?;

    // Get correct answer to check
    let correct: Option<String> = conn
        .query_row(
            "SELECT correct_answer FROM exam_questions WHERE id = ?1",
            rusqlite::params![question_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Question not found: {e}"))?;

    let is_correct = correct.as_ref().map(|c| {
        c.trim().to_lowercase() == user_answer.trim().to_lowercase()
    });

    let score = is_correct.map(|ic| if ic { 1.0_f64 } else { 0.0 });

    conn.execute(
        "UPDATE exam_questions
         SET user_answer = ?1, is_correct = ?2, score = ?3, time_spent_sec = ?4
         WHERE id = ?5",
        rusqlite::params![
            user_answer,
            is_correct.map(|b| b as i32),
            score,
            time_spent_sec,
            question_id,
        ],
    )
    .map_err(|e| format!("Answer error: {e}"))?;

    conn.query_row(
        &format!("SELECT {} FROM exam_questions WHERE id = ?1", QUESTION_COLS),
        rusqlite::params![question_id],
        map_question_row,
    )
    .map_err(|e| format!("Question not found: {e}"))
}

#[tauri::command]
pub fn exam_score_question(
    state: State<'_, AppState>,
    question_id: String,
    score: f64,
    is_correct: bool,
    feedback: Option<String>,
) -> Result<ExamQuestion, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "UPDATE exam_questions SET score = ?1, is_correct = ?2, feedback = ?3 WHERE id = ?4",
        rusqlite::params![score, is_correct as i32, feedback, question_id],
    )
    .map_err(|e| format!("Score error: {e}"))?;

    conn.query_row(
        &format!("SELECT {} FROM exam_questions WHERE id = ?1", QUESTION_COLS),
        rusqlite::params![question_id],
        map_question_row,
    )
    .map_err(|e| format!("Question not found: {e}"))
}

// ── Template Commands ───────────────────────────────────

#[tauri::command]
pub fn exam_list_templates(
    state: State<'_, AppState>,
    exam_type: Option<String>,
    language: Option<String>,
) -> Result<Vec<ExamTemplate>, String> {
    let conn = lock_db(&state)?;

    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match (&exam_type, &language) {
        (Some(et), Some(lang)) => (
            format!("SELECT {} FROM exam_templates WHERE exam_type = ?1 AND language = ?2 ORDER BY created_at DESC", TEMPLATE_COLS),
            vec![Box::new(et.clone()) as Box<dyn rusqlite::types::ToSql>, Box::new(lang.clone())],
        ),
        (Some(et), None) => (
            format!("SELECT {} FROM exam_templates WHERE exam_type = ?1 ORDER BY created_at DESC", TEMPLATE_COLS),
            vec![Box::new(et.clone()) as Box<dyn rusqlite::types::ToSql>],
        ),
        (None, Some(lang)) => (
            format!("SELECT {} FROM exam_templates WHERE language = ?1 ORDER BY created_at DESC", TEMPLATE_COLS),
            vec![Box::new(lang.clone()) as Box<dyn rusqlite::types::ToSql>],
        ),
        (None, None) => (
            format!("SELECT {} FROM exam_templates ORDER BY created_at DESC", TEMPLATE_COLS),
            vec![],
        ),
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {e}"))?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt
        .query_map(params_refs.as_slice(), map_template_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut templates = Vec::new();
    for row in rows {
        templates.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(templates)
}

#[tauri::command]
pub fn exam_create_template(
    state: State<'_, AppState>,
    exam_type: String,
    title: String,
    description: Option<String>,
    language: String,
    sections_json: String,
    time_limit_min: Option<i64>,
    total_questions: i64,
    cefr_level: Option<String>,
) -> Result<ExamTemplate, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO exam_templates
            (id, exam_type, title, description, language, sections_json,
             time_limit_min, total_questions, cefr_level)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            exam_type, title, description, language,
            sections_json, time_limit_min, total_questions, cefr_level,
        ],
    )
    .map_err(|e| format!("Template create error: {e}"))?;

    let id: String = conn
        .query_row(
            "SELECT id FROM exam_templates ORDER BY created_at DESC LIMIT 1",
            [],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Template lookup error: {e}"))?;

    conn.query_row(
        &format!("SELECT {} FROM exam_templates WHERE id = ?1", TEMPLATE_COLS),
        rusqlite::params![id],
        map_template_row,
    )
    .map_err(|e| format!("Template not found: {e}"))
}

// ── History Commands ────────────────────────────────────

#[tauri::command]
pub fn exam_get_history(
    state: State<'_, AppState>,
    exam_type: Option<String>,
) -> Result<Vec<ExamHistory>, String> {
    let conn = lock_db(&state)?;

    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(et) = &exam_type {
        (
            format!("SELECT {} FROM exam_history WHERE exam_type = ?1 ORDER BY updated_at DESC", HISTORY_COLS),
            vec![Box::new(et.clone()) as Box<dyn rusqlite::types::ToSql>],
        )
    } else {
        (
            format!("SELECT {} FROM exam_history ORDER BY updated_at DESC", HISTORY_COLS),
            vec![],
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {e}"))?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt
        .query_map(params_refs.as_slice(), map_history_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut history = Vec::new();
    for row in rows {
        history.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(history)
}

// ── Input Types ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionInput {
    pub section_index: i64,
    pub question_index: i64,
    pub question_type: String,
    pub prompt: String,
    pub context_text: Option<String>,
    pub audio_url: Option<String>,
    pub image_url: Option<String>,
    pub options: Vec<String>,
    pub correct_answer: Option<String>,
    pub max_score: Option<f64>,
}

// ── Column Constants ────────────────────────────────────

const SESSION_COLS: &str =
    "id, exam_type, title, language, status, total_sections, current_section,
     total_questions, answered_count, correct_count, overall_score, band_score,
     time_limit_min, elapsed_seconds, sections_json, results_json, feedback_json,
     created_at, updated_at, started_at, completed_at";

const QUESTION_COLS: &str =
    "id, session_id, section_index, question_index, question_type, prompt,
     context_text, audio_url, image_url, options_json, correct_answer,
     user_answer, is_correct, score, max_score, feedback, time_spent_sec, created_at";

const TEMPLATE_COLS: &str =
    "id, exam_type, title, description, language, sections_json,
     time_limit_min, total_questions, cefr_level, is_builtin, created_at";

const HISTORY_COLS: &str =
    "id, exam_type, language, total_attempts, best_score, average_score,
     best_band, last_attempt_at, updated_at";

// ── Row Mappers ─────────────────────────────────────────

fn map_session_row(row: &rusqlite::Row) -> rusqlite::Result<ExamSession> {
    Ok(ExamSession {
        id: row.get(0)?,
        exam_type: row.get(1)?,
        title: row.get(2)?,
        language: row.get(3)?,
        status: row.get(4)?,
        total_sections: row.get(5)?,
        current_section: row.get(6)?,
        total_questions: row.get(7)?,
        answered_count: row.get(8)?,
        correct_count: row.get(9)?,
        overall_score: row.get(10)?,
        band_score: row.get(11)?,
        time_limit_min: row.get(12)?,
        elapsed_seconds: row.get(13)?,
        sections_json: row.get(14)?,
        results_json: row.get(15)?,
        feedback_json: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
        started_at: row.get(19)?,
        completed_at: row.get(20)?,
    })
}

fn map_question_row(row: &rusqlite::Row) -> rusqlite::Result<ExamQuestion> {
    Ok(ExamQuestion {
        id: row.get(0)?,
        session_id: row.get(1)?,
        section_index: row.get(2)?,
        question_index: row.get(3)?,
        question_type: row.get(4)?,
        prompt: row.get(5)?,
        context_text: row.get(6)?,
        audio_url: row.get(7)?,
        image_url: row.get(8)?,
        options_json: row.get(9)?,
        correct_answer: row.get(10)?,
        user_answer: row.get(11)?,
        is_correct: row.get::<_, Option<i32>>(12)?.map(|v| v != 0),
        score: row.get(13)?,
        max_score: row.get(14)?,
        feedback: row.get(15)?,
        time_spent_sec: row.get(16)?,
        created_at: row.get(17)?,
    })
}

fn map_template_row(row: &rusqlite::Row) -> rusqlite::Result<ExamTemplate> {
    Ok(ExamTemplate {
        id: row.get(0)?,
        exam_type: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        language: row.get(4)?,
        sections_json: row.get(5)?,
        time_limit_min: row.get(6)?,
        total_questions: row.get(7)?,
        cefr_level: row.get(8)?,
        is_builtin: row.get::<_, i32>(9)? != 0,
        created_at: row.get(10)?,
    })
}

fn map_history_row(row: &rusqlite::Row) -> rusqlite::Result<ExamHistory> {
    Ok(ExamHistory {
        id: row.get(0)?,
        exam_type: row.get(1)?,
        language: row.get(2)?,
        total_attempts: row.get(3)?,
        best_score: row.get(4)?,
        average_score: row.get(5)?,
        best_band: row.get(6)?,
        last_attempt_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

// ── Internal Helpers ────────────────────────────────────

fn get_session_by_id(conn: &rusqlite::Connection, id: &str) -> Result<ExamSession, String> {
    conn.query_row(
        &format!("SELECT {} FROM exam_sessions WHERE id = ?1", SESSION_COLS),
        rusqlite::params![id],
        map_session_row,
    )
    .map_err(|e| format!("Session not found: {e}"))
}

fn get_questions_for_session(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Vec<ExamQuestion>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM exam_questions WHERE session_id = ?1 ORDER BY section_index, question_index",
            QUESTION_COLS
        ))
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![session_id], map_question_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut questions = Vec::new();
    for row in rows {
        questions.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(questions)
}

fn update_exam_history(conn: &rusqlite::Connection, session_id: &str) -> Result<(), String> {
    let (exam_type, language, score): (String, String, Option<f64>) = conn
        .query_row(
            "SELECT exam_type, language, overall_score FROM exam_sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row: &rusqlite::Row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("History lookup error: {e}"))?;

    let band_score: Option<String> = conn
        .query_row(
            "SELECT band_score FROM exam_sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or(None);

    conn.execute(
        "INSERT INTO exam_history (id, exam_type, language, total_attempts, best_score, average_score, best_band, last_attempt_at)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, 1, COALESCE(?3, 0), COALESCE(?3, 0), ?4, datetime('now'))
         ON CONFLICT(exam_type, language) DO UPDATE SET
            total_attempts = total_attempts + 1,
            average_score = CASE
                WHEN ?3 IS NOT NULL
                THEN (average_score * (total_attempts - 1) + ?3) / total_attempts
                ELSE average_score
            END,
            best_score = CASE
                WHEN ?3 IS NOT NULL AND ?3 > best_score THEN ?3
                ELSE best_score
            END,
            best_band = CASE
                WHEN ?4 IS NOT NULL THEN ?4
                ELSE best_band
            END,
            last_attempt_at = datetime('now'),
            updated_at = datetime('now')",
        rusqlite::params![exam_type, language, score, band_score],
    )
    .map_err(|e| format!("History update error: {e}"))?;

    Ok(())
}
