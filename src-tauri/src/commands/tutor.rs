use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::tutor::parser::{parse_ai_response, GrammarCorrection, VocabSuggestion};
use crate::tutor::prompts::build_system_prompt;
use crate::ai::provider::{chat_completion, ChatMessage};
use crate::tutor::scenarios::{Scenario, get_scenarios};
use crate::AppState;

// ── IPC Types ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub language: String,
    pub cefr_level: String,
    pub scenario_id: Option<String>,
    pub provider: String,
    pub model: String,
    pub message_count: i64,
    pub corrections_count: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageData {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub corrections: Vec<GrammarCorrection>,
    pub vocab_suggestions: Vec<VocabSuggestion>,
    pub token_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageResult {
    pub user_message: MessageData,
    pub assistant_message: MessageData,
}

// ── Helper ─────────────────────────────────────────────────

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

fn count_tokens(text: &str) -> i64 {
    (text.len() as f64 / 3.5).ceil() as i64
}

// ── Conversation Commands ──────────────────────────────────

#[tauri::command]
pub fn tutor_start_conversation(
    state: State<'_, AppState>,
    title: String,
    language: String,
    cefr_level: String,
    provider: String,
    model: String,
    scenario_id: Option<String>,
) -> Result<ConversationSummary, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO conversations (id, title, language, cefr_level, scenario_id, provider, model)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![title, language, cefr_level, scenario_id, provider, model],
    )
    .map_err(|e| format!("Insert error: {e}"))?;

    // Fetch the created conversation
    let conv = conn
        .query_row(
            "SELECT id, title, language, cefr_level, scenario_id, provider, model,
                    message_count, corrections_count, status, created_at, updated_at
             FROM conversations ORDER BY created_at DESC LIMIT 1",
            [],
            map_conversation_row,
        )
        .map_err(|e| format!("Fetch error: {e}"))?;

    // Insert system prompt as first message
    let native_lang = get_native_language(&conn);
    let system_prompt = build_system_prompt(
        &conv.language,
        &conv.cefr_level,
        &native_lang,
        conv.scenario_id.as_deref(),
    );

    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, token_count)
         VALUES (lower(hex(randomblob(16))), ?1, 'system', ?2, ?3)",
        rusqlite::params![conv.id, system_prompt, count_tokens(&system_prompt)],
    )
    .map_err(|e| format!("System message insert error: {e}"))?;

    Ok(conv)
}

#[tauri::command]
pub fn tutor_list_conversations(
    state: State<'_, AppState>,
    status: Option<String>,
) -> Result<Vec<ConversationSummary>, String> {
    let conn = lock_db(&state)?;

    let sql = if status.is_some() {
        "SELECT id, title, language, cefr_level, scenario_id, provider, model,
                message_count, corrections_count, status, created_at, updated_at
         FROM conversations WHERE status = ?1
         ORDER BY updated_at DESC"
    } else {
        "SELECT id, title, language, cefr_level, scenario_id, provider, model,
                message_count, corrections_count, status, created_at, updated_at
         FROM conversations WHERE status != 'deleted'
         ORDER BY updated_at DESC"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| format!("Query error: {e}"))?;

    let rows = if let Some(ref s) = status {
        stmt.query_map(rusqlite::params![s], map_conversation_row)
    } else {
        stmt.query_map([], map_conversation_row)
    }
    .map_err(|e| format!("Query error: {e}"))?;

    let mut convs = Vec::new();
    for row in rows {
        convs.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(convs)
}

#[tauri::command]
pub fn tutor_get_messages(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<Vec<MessageData>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, role, content, corrections,
                    vocab_suggestions, token_count, created_at
             FROM messages WHERE conversation_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![conversation_id], |row: &rusqlite::Row| {
            let corrections_json: String = row.get(4)?;
            let vocab_json: String = row.get(5)?;

            Ok(MessageData {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                corrections: serde_json::from_str(&corrections_json).unwrap_or_default(),
                vocab_suggestions: serde_json::from_str(&vocab_json).unwrap_or_default(),
                token_count: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(messages)
}

#[tauri::command]
pub async fn tutor_send_message(
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
) -> Result<SendMessageResult, String> {
    // 1. Read conversation and history
    let (provider, model, messages_for_ai) = {
        let conn = lock_db(&state)?;

        let (provider, model): (String, String) = conn
            .query_row(
                "SELECT provider, model FROM conversations WHERE id = ?1",
                rusqlite::params![conversation_id],
                |row: &rusqlite::Row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Conversation not found: {e}"))?;

        // Get recent messages for context (last 20)
        let mut stmt = conn
            .prepare(
                "SELECT role, content FROM messages
                 WHERE conversation_id = ?1
                 ORDER BY created_at ASC",
            )
            .map_err(|e| format!("Query error: {e}"))?;

        let history: Vec<ChatMessage> = stmt
            .query_map(rusqlite::params![conversation_id], |row: &rusqlite::Row| {
                Ok(ChatMessage {
                    role: row.get(0)?,
                    content: row.get(1)?,
                })
            })
            .map_err(|e| format!("Query error: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        // Build context: history + current user message
        let mut messages_for_ai = history;
        messages_for_ai.push(ChatMessage {
            role: "user".to_string(),
            content: content.clone(),
        });

        // 2. Store user message
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, token_count)
             VALUES (lower(hex(randomblob(16))), ?1, 'user', ?2, ?3)",
            rusqlite::params![conversation_id, content, count_tokens(&content)],
        )
        .map_err(|e| format!("User message insert error: {e}"))?;

        (provider, model, messages_for_ai)
    };

    // 3. Get API key from settings (for non-Ollama providers)
    let api_key = if provider != "ollama" {
        let conn = lock_db(&state)?;
        let key_name = format!("{}_api_key", provider);
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params![key_name],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        )
        .ok()
    } else {
        None
    };

    // Get custom base URL from settings if set
    let base_url_setting = {
        let conn = lock_db(&state)?;
        let url_key = format!("{}_base_url", provider);
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params![url_key],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        )
        .ok()
    };

    // 4. Call AI provider
    let raw_response = chat_completion(
        &provider,
        &model,
        messages_for_ai,
        api_key.as_deref(),
        base_url_setting.as_deref(),
        None,
        None,
        false,
    )
    .await?;

    // 5. Parse corrections and vocabulary
    let (clean_content, corrections, vocab) = parse_ai_response(&raw_response);

    let corrections_json = serde_json::to_string(&corrections).unwrap_or_else(|_| "[]".into());
    let vocab_json = serde_json::to_string(&vocab).unwrap_or_else(|_| "[]".into());
    let token_count = count_tokens(&raw_response);

    // 6. Store assistant message and update conversation
    let (user_msg, assistant_msg) = {
        let conn = lock_db(&state)?;

        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, corrections, vocab_suggestions, token_count)
             VALUES (lower(hex(randomblob(16))), ?1, 'assistant', ?2, ?3, ?4, ?5)",
            rusqlite::params![conversation_id, clean_content, corrections_json, vocab_json, token_count],
        )
        .map_err(|e| format!("Assistant message insert error: {e}"))?;

        // Update conversation stats
        let correction_count = corrections.len() as i64;
        conn.execute(
            "UPDATE conversations SET
                message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = ?1 AND role != 'system'),
                corrections_count = corrections_count + ?2,
                updated_at = datetime('now')
             WHERE id = ?1",
            rusqlite::params![conversation_id, correction_count],
        )
        .map_err(|e| format!("Conversation update error: {e}"))?;

        // Get the user message we just stored
        let user_msg: MessageData = conn
            .query_row(
                "SELECT id, conversation_id, role, content, corrections, vocab_suggestions, token_count, created_at
                 FROM messages WHERE conversation_id = ?1 AND role = 'user'
                 ORDER BY created_at DESC LIMIT 1",
                rusqlite::params![conversation_id],
                map_message_row,
            )
            .map_err(|e| format!("User message fetch error: {e}"))?;

        let assistant_msg: MessageData = conn
            .query_row(
                "SELECT id, conversation_id, role, content, corrections, vocab_suggestions, token_count, created_at
                 FROM messages WHERE conversation_id = ?1 AND role = 'assistant'
                 ORDER BY created_at DESC LIMIT 1",
                rusqlite::params![conversation_id],
                map_message_row,
            )
            .map_err(|e| format!("Assistant message fetch error: {e}"))?;

        (user_msg, assistant_msg)
    };

    Ok(SendMessageResult {
        user_message: user_msg,
        assistant_message: assistant_msg,
    })
}

#[tauri::command]
pub fn tutor_delete_conversation(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE conversations SET status = 'deleted', updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn tutor_archive_conversation(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE conversations SET status = 'archived', updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Archive error: {e}"))?;
    Ok(())
}

// ── Scenario Commands ─────────────────────────────────────

#[tauri::command]
pub fn tutor_list_scenarios() -> Vec<Scenario> {
    get_scenarios()
}

#[tauri::command]
pub fn tutor_get_scenario(id: String) -> Result<Scenario, String> {
    get_scenarios()
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("Scenario not found: {id}"))
}

// ── Streaming Message Command ─────────────────────────────

#[tauri::command]
pub async fn tutor_send_message_stream(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
) -> Result<(), String> {
    // 1. Get conversation details
    let (language, cefr_level, provider, model, scenario_id) = {
        let conn = state.db.lock().map_err(|e| format!("DB lock: {e}"))?;
        conn.query_row(
            "SELECT language, cefr_level, provider, model, scenario_id FROM conversations WHERE id = ?1",
            rusqlite::params![conversation_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            )),
        )
        .map_err(|e| format!("Conversation not found: {e}"))?
    };

    // 2. Store user message
    {
        let conn = state.db.lock().map_err(|e| format!("DB lock: {e}"))?;
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content)
             VALUES (lower(hex(randomblob(16))), ?1, 'user', ?2)",
            rusqlite::params![conversation_id, content],
        )
        .map_err(|e| format!("Insert user message error: {e}"))?;

        conn.execute(
            "UPDATE conversations SET message_count = message_count + 1, updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![conversation_id],
        )
        .map_err(|e| format!("Update conversation error: {e}"))?;
    }

    // 3. Build messages for AI
    let messages_for_ai = {
        let conn = state.db.lock().map_err(|e| format!("DB lock: {e}"))?;
        let native_lang = get_native_language(&conn);
        let system_prompt = build_system_prompt(&language, &cefr_level, &native_lang, scenario_id.as_deref());

        let mut msgs = vec![ChatMessage {
            role: "system".to_string(),
            content: system_prompt,
        }];

        let mut stmt = conn.prepare(
            "SELECT role, content FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC"
        ).map_err(|e| format!("Query: {e}"))?;

        let rows = stmt.query_map(rusqlite::params![conversation_id], |row| {
            Ok(ChatMessage {
                role: row.get(0)?,
                content: row.get(1)?,
            })
        }).map_err(|e| format!("Query: {e}"))?;

        for row in rows {
            if let Ok(msg) = row {
                msgs.push(msg);
            }
        }
        msgs
    };

    // 4. Get settings
    let (api_key, base_url) = {
        let conn = state.db.lock().map_err(|e| format!("DB lock: {e}"))?;
        let key = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params![format!("{}_api_key", provider)],
            |row| row.get::<_, String>(0),
        ).ok();
        let url = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params![format!("{}_base_url", provider)],
            |row| row.get::<_, String>(0),
        ).ok();
        (key, url)
    };

    // 5. Call AI provider (non-streaming for now, emit full response as single token)
    let ai_response = chat_completion(
        &provider,
        &model,
        messages_for_ai,
        api_key.as_deref(),
        base_url.as_deref(),
        None,
        None,
        false,
    )
    .await?;

    // Emit response
    let _ = app.emit("tutor:token", serde_json::json!({
        "conversationId": conversation_id,
        "token": ai_response,
    }));

    // 6. Parse corrections and vocab
    let (clean_content, corrections, vocab) = parse_ai_response(&ai_response);

    // 7. Store assistant message
    let corrections_json = serde_json::to_string(&corrections).unwrap_or_else(|_| "[]".to_string());
    let vocab_json = serde_json::to_string(&vocab).unwrap_or_else(|_| "[]".to_string());

    {
        let conn = state.db.lock().map_err(|e| format!("DB lock: {e}"))?;
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, corrections, vocab_suggestions)
             VALUES (lower(hex(randomblob(16))), ?1, 'assistant', ?2, ?3, ?4)",
            rusqlite::params![conversation_id, clean_content, corrections_json, vocab_json],
        )
        .map_err(|e| format!("Insert assistant message: {e}"))?;

        conn.execute(
            "UPDATE conversations SET message_count = message_count + 1, updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![conversation_id],
        )
        .map_err(|e| format!("Update conversation: {e}"))?;
    }

    // 8. Emit completion
    let _ = app.emit("tutor:complete", serde_json::json!({
        "conversationId": conversation_id,
        "corrections": corrections,
        "vocabSuggestions": vocab,
    }));

    Ok(())
}

// ── Row Mappers ────────────────────────────────────────────

fn map_conversation_row(row: &rusqlite::Row) -> rusqlite::Result<ConversationSummary> {
    Ok(ConversationSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        language: row.get(2)?,
        cefr_level: row.get(3)?,
        scenario_id: row.get(4)?,
        provider: row.get(5)?,
        model: row.get(6)?,
        message_count: row.get(7)?,
        corrections_count: row.get(8)?,
        status: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn map_message_row(row: &rusqlite::Row) -> rusqlite::Result<MessageData> {
    let corrections_json: String = row.get(4)?;
    let vocab_json: String = row.get(5)?;

    Ok(MessageData {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        corrections: serde_json::from_str(&corrections_json).unwrap_or_default(),
        vocab_suggestions: serde_json::from_str(&vocab_json).unwrap_or_default(),
        token_count: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn get_native_language(conn: &rusqlite::Connection) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'native_language'",
        [],
        |row: &rusqlite::Row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "en".to_string())
}
