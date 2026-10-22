//! Commands for the website's Writing practice, run on the user's OWN AI.
//! Sessions live in SQLite (`wp_sessions`). Prompt generation and grading go through the
//! provider the user configured; nothing here ever calls FlexiLingo's cloud AI (that route
//! is the front end's, and only when the user switched it on).

use serde_json::Value;
use tauri::State;

use crate::ai::json_extractor::extract_json;
use crate::ai::provider::{chat_completion, read_ai_settings, ChatMessage};
use crate::writing_practice::{self as wp, store, GradedBy};
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

/// Errors that mean "the user's AI is not set up": passed through untouched so the UI shows the setup card.
fn is_setup_error(e: &str) -> bool {
    e.contains("OLLAMA_NOT_RUNNING") || e.contains("OLLAMA_MODEL_MISSING") || e.contains("AI_KEY_MISSING")
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

async fn ask(
    state: &State<'_, AppState>,
    messages: Vec<ChatMessage>,
    temperature: f64,
    max_tokens: u32,
) -> Result<(Value, String, String), String> {
    let settings = {
        let conn = lock_db(state)?;
        read_ai_settings(&conn)
    };
    let origin = if settings.provider == "ollama" { "device" } else { "own_key" };
    let text = chat_completion(
        &settings.provider,
        &settings.model,
        messages,
        settings.api_key.as_deref(),
        settings.base_url.as_deref(),
        Some(temperature),
        Some(max_tokens),
        true,
    )
    .await?;
    Ok((extract_json(&text)?, settings.model, origin.to_string()))
}

/// A new writing prompt written by the user's AI. Falls back to the server's canned prompt for
/// the exam when the answer is unusable; an AI that is not set up is an error (the setup card).
#[tauri::command]
pub async fn wp_generate_prompt(
    state: State<'_, AppState>,
    exam_type: String,
    difficulty: Option<String>,
) -> Result<Value, String> {
    let r = wp::rubric(&exam_type).ok_or("INVALID_EXAM_TYPE")?;
    let messages = wp::build_prompt_messages(r, difficulty.as_deref());
    let (generated, source) = match ask(&state, messages, 0.8, 1500).await {
        Ok((v, _, _)) => match wp::parse_generated_prompt(&v) {
            Some(g) => (g, "ai"),
            None => (wp::fallback_prompt(&exam_type), "fallback"),
        },
        Err(e) if is_setup_error(&e) => return Err(e),
        Err(_) => (wp::fallback_prompt(&exam_type), "fallback"),
    };
    let id = format!("wpp-{}", uuid::Uuid::new_v4().simple());
    Ok(wp::prompt_json(&id, &exam_type, &generated, source, &now_iso()))
}

#[tauri::command]
pub fn wp_create_session(
    state: State<'_, AppState>,
    exam_type: String,
    prompt: Value,
    timer_enabled: Option<bool>,
) -> Result<Value, String> {
    let r = wp::rubric(&exam_type).ok_or("INVALID_EXAM_TYPE")?;
    if prompt.get("prompt_text").and_then(|p| p.as_str()).unwrap_or("").is_empty() {
        return Err("MISSING_REQUIRED_FIELDS".into());
    }
    let conn = lock_db(&state)?;
    let timer = timer_enabled.unwrap_or(true);
    let session = store::create_session(&conn, &exam_type, &prompt, timer, Some(r.time_limit_seconds))?;
    Ok(serde_json::json!({
        "session_id": session["id"],
        "prompt": session["prompt"],
        "session": session,
    }))
}

#[tauri::command]
pub fn wp_get_session(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let conn = lock_db(&state)?;
    store::get_session(&conn, &id)?.ok_or_else(|| "WRITING_SESSION_NOT_FOUND".to_string())
}

#[tauri::command]
pub fn wp_get_active(state: State<'_, AppState>) -> Result<Value, String> {
    let conn = lock_db(&state)?;
    Ok(store::get_active(&conn)?.unwrap_or(Value::Null))
}

#[tauri::command]
pub fn wp_save_draft(
    state: State<'_, AppState>,
    session_id: String,
    essay_text: String,
    word_count: i64,
    time_spent_seconds: i64,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    store::save_draft(&conn, &session_id, &essay_text, word_count, time_spent_seconds)
}

#[tauri::command]
pub fn wp_cancel_session(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let conn = lock_db(&state)?;
    store::cancel(&conn, &session_id)
}

#[tauri::command]
pub fn wp_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
    exam_type: Option<String>,
) -> Result<Value, String> {
    let conn = lock_db(&state)?;
    store::history(&conn, limit.unwrap_or(20), offset.unwrap_or(0), exam_type.as_deref())
}

/// Saves the essay, grades it with the user's AI and returns the graded session. If the AI is
/// not set up or fails, the session goes back to "active" with the essay kept.
#[tauri::command]
pub async fn wp_submit(
    state: State<'_, AppState>,
    session_id: String,
    essay_text: String,
    word_count: Option<i64>,
    time_spent_seconds: Option<i64>,
) -> Result<Value, String> {
    if essay_text.chars().count() > wp::MAX_ESSAY_CHARS {
        return Err("WRITING_ESSAY_TOO_LONG".into());
    }
    let words = wp::word_count(&essay_text);
    if words < wp::MIN_WORDS {
        return Err("WRITING_ESSAY_TOO_SHORT".into());
    }
    let (rubric, prompt_text, supplementary) = {
        let conn = lock_db(&state)?;
        let session = store::get_session(&conn, &session_id)?.ok_or("WRITING_SESSION_NOT_FOUND")?;
        if session["status"] != "active" {
            return Err("WRITING_SESSION_ALREADY_SUBMITTED".into());
        }
        let exam = session["exam_type"].as_str().unwrap_or("").to_string();
        let rubric = wp::rubric(&exam).ok_or("INVALID_EXAM_TYPE")?;
        store::mark_submitted(
            &conn,
            &session_id,
            &essay_text,
            word_count.unwrap_or(words as i64),
            time_spent_seconds.unwrap_or(0),
        )?;
        (
            rubric,
            session["prompt"]["prompt_text"].as_str().unwrap_or("").to_string(),
            session["prompt"]["supplementary_data"].clone(),
        )
    };

    let supplementary = if supplementary.is_object() { Some(&supplementary) } else { None };
    let result = grade(&state, rubric, &prompt_text, supplementary, &essay_text).await;

    let conn = lock_db(&state)?;
    match result {
        Ok(graded) => {
            store::save_graded(&conn, &session_id, &graded)?;
            store::get_session(&conn, &session_id)?.ok_or_else(|| "WRITING_SESSION_NOT_FOUND".to_string())
        }
        Err(e) => {
            let _ = store::revert_to_active(&conn, &session_id);
            Err(if is_setup_error(&e) { e } else { "WRITING_GRADING_FAILED".to_string() })
        }
    }
}

/// One grading attempt, plus one retry when the model's JSON could not be used.
async fn grade(
    state: &State<'_, AppState>,
    rubric: &'static wp::types::Rubric,
    prompt_text: &str,
    supplementary: Option<&Value>,
    essay: &str,
) -> Result<Value, String> {
    let mut last = "WRITING_GRADING_FAILED".to_string();
    for _ in 0..2 {
        let messages = wp::build_grade_messages(rubric, prompt_text, supplementary, essay);
        match ask(state, messages, 0.2, 6000).await {
            Ok((raw, model, origin)) => {
                match wp::normalize_grading(&raw, rubric, essay, &GradedBy { model: &model, origin: &origin }) {
                    Ok(g) => return Ok(g),
                    Err(e) => last = e,
                }
            }
            Err(e) if is_setup_error(&e) => return Err(e),
            Err(e) => last = e,
        }
    }
    Err(last)
}
