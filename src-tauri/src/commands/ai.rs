use tauri::State;

use crate::ai::json_extractor::extract_json;
use crate::ai::prompts::{sentence_chat, word_analysis, writing_eval};
use crate::ai::provider::{chat_completion, read_ai_settings, ChatMessage};
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

// ── Word Analysis ─────────────────────────────────────────

#[tauri::command]
pub async fn ai_word_analysis(
    state: State<'_, AppState>,
    word: String,
    sentence: String,
    target_language: String,
    source_language: String,
) -> Result<serde_json::Value, String> {
    let settings = {
        let conn = lock_db(&state)?;
        read_ai_settings(&conn)
    };

    let messages =
        word_analysis::build_messages(&word, &sentence, &target_language, &source_language);

    let response = chat_completion(
        &settings.provider,
        &settings.model,
        messages,
        settings.api_key.as_deref(),
        settings.base_url.as_deref(),
        Some(0.1),
        Some(500),
        true,
    )
    .await?;

    extract_json(&response)
}

// ── Sentence Chat ─────────────────────────────────────────

#[tauri::command]
pub async fn ai_sentence_chat(
    state: State<'_, AppState>,
    episode_id: String,
    message: String,
    sentence_context: String,
    target_language: String,
    action: Option<String>,
) -> Result<String, String> {
    let settings = {
        let conn = lock_db(&state)?;
        read_ai_settings(&conn)
    };

    // Build the user message
    let user_content = if let Some(ref act) = action {
        sentence_chat::build_action_message(act, &sentence_context, &target_language)
    } else {
        message.clone()
    };

    // Load history from DB
    let history: Vec<ChatMessage> = {
        let conn = lock_db(&state)?;
        let mut stmt = conn
            .prepare(
                "SELECT role, content FROM sentence_chat_messages \
                 WHERE episode_id = ?1 ORDER BY created_at ASC LIMIT 20",
            )
            .map_err(|e| format!("Query error: {e}"))?;
        let rows = stmt
            .query_map(rusqlite::params![episode_id], |row: &rusqlite::Row| {
                Ok(ChatMessage {
                    role: row.get::<_, String>(0)?,
                    content: row.get::<_, String>(1)?,
                })
            })
            .map_err(|e| format!("Query error: {e}"))?;
        rows.filter_map(|r: Result<ChatMessage, _>| r.ok()).collect()
    };

    // Build messages: system + history + new user message
    let system = sentence_chat::build_system_prompt(&target_language);
    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: system,
    }];
    messages.extend(history);
    messages.push(ChatMessage {
        role: "user".into(),
        content: user_content.clone(),
    });

    let reply = chat_completion(
        &settings.provider,
        &settings.model,
        messages,
        settings.api_key.as_deref(),
        settings.base_url.as_deref(),
        Some(0.7),
        Some(800),
        false,
    )
    .await?;

    // Store user message and AI response in DB
    {
        let conn = lock_db(&state)?;
        let user_id = format!("msg-{}", uuid::Uuid::new_v4());
        let asst_id = format!("msg-{}", uuid::Uuid::new_v4());
        conn.execute(
            "INSERT INTO sentence_chat_messages (id, episode_id, role, content, sentence_context) \
             VALUES (?1, ?2, 'user', ?3, ?4)",
            rusqlite::params![user_id, episode_id, user_content, sentence_context],
        )
        .map_err(|e| format!("Insert error: {e}"))?;
        conn.execute(
            "INSERT INTO sentence_chat_messages (id, episode_id, role, content) \
             VALUES (?1, ?2, 'assistant', ?3)",
            rusqlite::params![asst_id, episode_id, reply],
        )
        .map_err(|e| format!("Insert error: {e}"))?;
    }

    Ok(reply)
}

#[tauri::command]
pub fn ai_sentence_chat_history(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = lock_db(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, role, content, created_at FROM sentence_chat_messages \
             WHERE episode_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![episode_id], |row: &rusqlite::Row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "role": row.get::<_, String>(1)?,
                "content": row.get::<_, String>(2)?,
                "created_at": row.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut messages: Vec<serde_json::Value> = Vec::new();
    for row in rows {
        messages.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(messages)
}

#[tauri::command]
pub fn ai_sentence_chat_clear(
    state: State<'_, AppState>,
    episode_id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM sentence_chat_messages WHERE episode_id = ?1",
        rusqlite::params![episode_id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

// ── Writing Evaluation ────────────────────────────────────

#[tauri::command]
pub async fn ai_evaluate_writing(
    state: State<'_, AppState>,
    essay_text: String,
    exam_type: String,
    prompt_text: String,
) -> Result<serde_json::Value, String> {
    let settings = {
        let conn = lock_db(&state)?;
        read_ai_settings(&conn)
    };

    let messages = writing_eval::build_messages(&essay_text, &exam_type, &prompt_text);

    let response = chat_completion(
        &settings.provider,
        &settings.model,
        messages,
        settings.api_key.as_deref(),
        settings.base_url.as_deref(),
        Some(0.1),
        Some(4000),
        true,
    )
    .await?;

    extract_json(&response)
}
