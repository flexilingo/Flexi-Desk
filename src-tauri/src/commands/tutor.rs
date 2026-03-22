use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::ai::provider::{chat_completion, chat_completion_stream, read_ai_settings, ChatMessage};
use crate::tutor::modes::{list_modes, ModeInfo};
use crate::tutor::parser::{parse_ai_response, GrammarCorrection, VocabSuggestion};
use crate::tutor::prompts::{build_system_prompt_full, opening_message};
use crate::tutor::scenarios::{get_scenarios, Scenario};
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
    pub mode: String,
    pub topic: Option<String>,
    pub deck_id: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckCard {
    pub id: String,
    pub front: String,
    pub back: String,
}

// ── Helpers ────────────────────────────────────────────────

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

fn count_tokens(text: &str) -> i64 {
    (text.len() as f64 / 3.5).ceil() as i64
}

fn get_native_language(conn: &rusqlite::Connection) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'native_language'",
        [],
        |row: &rusqlite::Row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "en".to_string())
}

/// Read AI settings from the settings table.
fn get_ai_settings(
    conn: &rusqlite::Connection,
) -> (String, String, Option<String>, Option<String>, String) {
    let settings = read_ai_settings(conn);
    let native_language = get_native_language(conn);
    (
        settings.provider,
        settings.model,
        settings.api_key,
        settings.base_url,
        native_language,
    )
}

/// Load all messages for a conversation as ChatMessage vec (for AI context).
fn build_message_history(
    conn: &rusqlite::Connection,
    conversation_id: &str,
) -> Result<Vec<ChatMessage>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT role, content FROM messages
             WHERE conversation_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![conversation_id], |row: &rusqlite::Row| {
            Ok(ChatMessage {
                role: row.get(0)?,
                content: row.get(1)?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(messages)
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
        mode: row.get(12)?,
        topic: row.get(13)?,
        deck_id: row.get(14)?,
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

const CONV_SELECT_COLS: &str =
    "id, title, language, cefr_level, scenario_id, provider, model, \
     message_count, corrections_count, status, created_at, updated_at, \
     mode, topic, deck_id";

// ── Conversation Commands ──────────────────────────────────

#[tauri::command]
pub async fn tutor_start_conversation(
    _app: tauri::AppHandle,
    state: State<'_, AppState>,
    title: String,
    language: String,
    cefr_level: String,
    scenario_id: Option<String>,
    mode: Option<String>,
    topic: Option<String>,
    deck_id: Option<String>,
) -> Result<ConversationSummary, String> {
    let mode = mode.unwrap_or_else(|| "free".to_string());

    // 1. Read AI settings, load deck words if needed, build system prompt
    let (provider, model, api_key, base_url, _native_lang, system_prompt, opening_user_msg) = {
        let conn = lock_db(&state)?;
        let (prov, mdl, key, url, native) = get_ai_settings(&conn);

        // Load deck words for deck_practice mode
        let deck_words: Option<Vec<String>> = if mode == "deck_practice" {
            if let Some(ref did) = deck_id {
                let mut stmt = conn
                    .prepare("SELECT front FROM srs_cards WHERE deck_id = ?1")
                    .map_err(|e| format!("Query error: {e}"))?;
                let words: Vec<String> = stmt
                    .query_map(rusqlite::params![did], |row| row.get::<_, String>(0))
                    .map_err(|e| format!("Query error: {e}"))?
                    .filter_map(|r| r.ok())
                    .collect();
                if words.is_empty() { None } else { Some(words) }
            } else {
                None
            }
        } else {
            None
        };

        // Resolve scenario context for role_play
        let scenario_ctx = if mode == "role_play" {
            scenario_id.as_deref().and_then(|sid| {
                get_scenarios()
                    .into_iter()
                    .find(|s| s.id == sid)
                    .map(|s| s.opening_prompt)
            })
        } else {
            None
        };

        let scenario_title = if mode == "role_play" {
            scenario_id.as_deref().and_then(|sid| {
                get_scenarios()
                    .into_iter()
                    .find(|s| s.id == sid)
                    .map(|s| s.title)
            })
        } else {
            None
        };

        let sys_prompt = build_system_prompt_full(
            &language,
            &native,
            &cefr_level,
            &mode,
            topic.as_deref(),
            scenario_ctx.as_deref(),
            deck_words.as_deref(),
        );

        let open_msg = opening_message(
            &mode,
            &language,
            &cefr_level,
            topic.as_deref(),
            scenario_title.as_deref(),
        );

        (prov, mdl, key, url, native, sys_prompt, open_msg)
    };

    // 2. Insert conversation into DB
    let conv = {
        let conn = lock_db(&state)?;

        conn.execute(
            "INSERT INTO conversations (id, title, language, cefr_level, scenario_id, provider, model, mode, topic, deck_id)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![title, language, cefr_level, scenario_id, provider, model, mode, topic, deck_id],
        )
        .map_err(|e| format!("Insert error: {e}"))?;

        let conv = conn
            .query_row(
                &format!("SELECT {CONV_SELECT_COLS} FROM conversations ORDER BY created_at DESC LIMIT 1"),
                [],
                map_conversation_row,
            )
            .map_err(|e| format!("Fetch error: {e}"))?;

        // Insert system prompt as first message
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, token_count)
             VALUES (lower(hex(randomblob(16))), ?1, 'system', ?2, ?3)",
            rusqlite::params![conv.id, system_prompt, count_tokens(&system_prompt)],
        )
        .map_err(|e| format!("System message insert error: {e}"))?;

        conv
    };

    // 3. Send opening message to AI to get the first assistant response
    let messages_for_ai = vec![
        ChatMessage {
            role: "system".to_string(),
            content: system_prompt.clone(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: opening_user_msg.clone(),
        },
    ];

    // Store the opening instruction as system message (hidden from UI)
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, token_count)
             VALUES (lower(hex(randomblob(16))), ?1, 'system', ?2, ?3)",
            rusqlite::params![conv.id, opening_user_msg, count_tokens(&opening_user_msg)],
        )
        .map_err(|e| format!("Opening system message insert error: {e}"))?;
    }

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

    // Parse and store assistant response
    let parsed = parse_ai_response(&ai_response);
    let corrections_json =
        serde_json::to_string(&parsed.corrections).unwrap_or_else(|_| "[]".into());
    let vocab_json =
        serde_json::to_string(&parsed.vocabulary).unwrap_or_else(|_| "[]".into());
    let token_count = count_tokens(&ai_response);

    {
        let conn = lock_db(&state)?;
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, corrections, vocab_suggestions, token_count)
             VALUES (lower(hex(randomblob(16))), ?1, 'assistant', ?2, ?3, ?4, ?5)",
            rusqlite::params![conv.id, parsed.content, corrections_json, vocab_json, token_count],
        )
        .map_err(|e| format!("Assistant message insert error: {e}"))?;

        conn.execute(
            "UPDATE conversations SET
                message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = ?1 AND role != 'system'),
                corrections_count = ?2,
                updated_at = datetime('now')
             WHERE id = ?1",
            rusqlite::params![conv.id, parsed.corrections.len() as i64],
        )
        .map_err(|e| format!("Update error: {e}"))?;
    }

    // Re-fetch conversation with updated stats
    let updated_conv = {
        let conn = lock_db(&state)?;
        conn.query_row(
            &format!("SELECT {CONV_SELECT_COLS} FROM conversations WHERE id = ?1"),
            rusqlite::params![conv.id],
            map_conversation_row,
        )
        .map_err(|e| format!("Fetch error: {e}"))?
    };

    Ok(updated_conv)
}

#[tauri::command]
pub fn tutor_list_conversations(
    state: State<'_, AppState>,
    status: Option<String>,
) -> Result<Vec<ConversationSummary>, String> {
    let conn = lock_db(&state)?;

    let sql = if status.is_some() {
        format!(
            "SELECT {CONV_SELECT_COLS} FROM conversations WHERE status = ?1 ORDER BY updated_at DESC"
        )
    } else {
        format!(
            "SELECT {CONV_SELECT_COLS} FROM conversations WHERE status != 'deleted' ORDER BY updated_at DESC"
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {e}"))?;

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
        .query_map(rusqlite::params![conversation_id], map_message_row)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(messages)
}

// ── Send Message (non-streaming fallback) ──────────────────

#[tauri::command]
pub async fn tutor_send_message(
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
) -> Result<SendMessageResult, String> {
    // 1. Store user message and build context
    let (provider, model, api_key, base_url, messages_for_ai) = {
        let conn = lock_db(&state)?;

        // Store user message
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, token_count)
             VALUES (lower(hex(randomblob(16))), ?1, 'user', ?2, ?3)",
            rusqlite::params![conversation_id, content, count_tokens(&content)],
        )
        .map_err(|e| format!("User message insert error: {e}"))?;

        // Load history (includes the user message we just stored)
        let history = build_message_history(&conn, &conversation_id)?;

        let (prov, mdl, key, url, _native) = get_ai_settings(&conn);
        (prov, mdl, key, url, history)
    };

    // 2. Call AI provider
    let raw_response = chat_completion(
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

    // 3. Parse response
    let parsed = parse_ai_response(&raw_response);
    let corrections_json =
        serde_json::to_string(&parsed.corrections).unwrap_or_else(|_| "[]".into());
    let vocab_json =
        serde_json::to_string(&parsed.vocabulary).unwrap_or_else(|_| "[]".into());
    let token_count = count_tokens(&raw_response);

    // 4. Store assistant message and update stats
    let (user_msg, assistant_msg) = {
        let conn = lock_db(&state)?;

        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, corrections, vocab_suggestions, token_count)
             VALUES (lower(hex(randomblob(16))), ?1, 'assistant', ?2, ?3, ?4, ?5)",
            rusqlite::params![conversation_id, parsed.content, corrections_json, vocab_json, token_count],
        )
        .map_err(|e| format!("Assistant message insert error: {e}"))?;

        let correction_count = parsed.corrections.len() as i64;
        conn.execute(
            "UPDATE conversations SET
                message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = ?1 AND role != 'system'),
                corrections_count = corrections_count + ?2,
                updated_at = datetime('now')
             WHERE id = ?1",
            rusqlite::params![conversation_id, correction_count],
        )
        .map_err(|e| format!("Conversation update error: {e}"))?;

        let user_msg = conn
            .query_row(
                "SELECT id, conversation_id, role, content, corrections, vocab_suggestions, token_count, created_at
                 FROM messages WHERE conversation_id = ?1 AND role = 'user'
                 ORDER BY created_at DESC LIMIT 1",
                rusqlite::params![conversation_id],
                map_message_row,
            )
            .map_err(|e| format!("User message fetch error: {e}"))?;

        let assistant_msg = conn
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

// ── Send Message (streaming) ──────────────────────────────

#[tauri::command]
pub async fn tutor_send_message_stream(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
) -> Result<SendMessageResult, String> {
    // 1. Store user message
    {
        let conn = lock_db(&state)?;
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, token_count)
             VALUES (lower(hex(randomblob(16))), ?1, 'user', ?2, ?3)",
            rusqlite::params![conversation_id, content, count_tokens(&content)],
        )
        .map_err(|e| format!("Insert user message error: {e}"))?;
    }

    // 2. Build messages for AI
    let (provider, model, api_key, base_url, messages_for_ai) = {
        let conn = lock_db(&state)?;
        let history = build_message_history(&conn, &conversation_id)?;
        let (prov, mdl, key, url, _native) = get_ai_settings(&conn);
        (prov, mdl, key, url, history)
    };

    // 3. Stream AI response, emitting tokens
    let conv_id = conversation_id.clone();
    let app_handle = app.clone();

    let full_response = chat_completion_stream(
        &provider,
        &model,
        messages_for_ai,
        api_key.as_deref(),
        base_url.as_deref(),
        None,
        None,
        move |token_text| {
            let _ = app_handle.emit(
                "tutor:token",
                serde_json::json!({
                    "conversation_id": conv_id,
                    "token": token_text,
                }),
            );
        },
    )
    .await?;

    // 4. Parse full response
    let parsed = parse_ai_response(&full_response);
    let corrections_json =
        serde_json::to_string(&parsed.corrections).unwrap_or_else(|_| "[]".into());
    let vocab_json =
        serde_json::to_string(&parsed.vocabulary).unwrap_or_else(|_| "[]".into());
    let token_count = count_tokens(&full_response);

    // 5. Store assistant message and update stats
    let (user_msg, assistant_msg) = {
        let conn = lock_db(&state)?;

        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, corrections, vocab_suggestions, token_count)
             VALUES (lower(hex(randomblob(16))), ?1, 'assistant', ?2, ?3, ?4, ?5)",
            rusqlite::params![conversation_id, parsed.content, corrections_json, vocab_json, token_count],
        )
        .map_err(|e| format!("Insert assistant message: {e}"))?;

        let correction_count = parsed.corrections.len() as i64;
        conn.execute(
            "UPDATE conversations SET
                message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = ?1 AND role != 'system'),
                corrections_count = corrections_count + ?2,
                updated_at = datetime('now')
             WHERE id = ?1",
            rusqlite::params![conversation_id, correction_count],
        )
        .map_err(|e| format!("Update conversation: {e}"))?;

        let user_msg = conn
            .query_row(
                "SELECT id, conversation_id, role, content, corrections, vocab_suggestions, token_count, created_at
                 FROM messages WHERE conversation_id = ?1 AND role = 'user'
                 ORDER BY created_at DESC LIMIT 1",
                rusqlite::params![conversation_id],
                map_message_row,
            )
            .map_err(|e| format!("User message fetch error: {e}"))?;

        let assistant_msg = conn
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

    // 6. Emit completion event
    let _ = app.emit(
        "tutor:complete",
        serde_json::json!({
            "conversation_id": conversation_id,
            "message_id": assistant_msg.id,
            "corrections": serde_json::to_value(&assistant_msg.corrections).unwrap_or_default(),
            "vocab_suggestions": serde_json::to_value(&assistant_msg.vocab_suggestions).unwrap_or_default(),
        }),
    );

    Ok(SendMessageResult {
        user_message: user_msg,
        assistant_message: assistant_msg,
    })
}

// ── Conversation Management Commands ──────────────────────

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

#[tauri::command]
pub fn tutor_end_conversation(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConversationSummary, String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE conversations SET status = 'archived', updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("End conversation error: {e}"))?;

    conn.query_row(
        &format!("SELECT {CONV_SELECT_COLS} FROM conversations WHERE id = ?1"),
        rusqlite::params![id],
        map_conversation_row,
    )
    .map_err(|e| format!("Fetch error: {e}"))
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

// ── Mode Commands ─────────────────────────────────────────

#[tauri::command]
pub fn tutor_list_modes() -> Vec<ModeInfo> {
    list_modes()
}

// ── Deck Commands ─────────────────────────────────────────

#[tauri::command]
pub fn tutor_get_deck_cards(
    state: State<'_, AppState>,
    deck_id: String,
) -> Result<Vec<DeckCard>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare("SELECT id, front, back FROM srs_cards WHERE deck_id = ?1")
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![deck_id], |row: &rusqlite::Row| {
            Ok(DeckCard {
                id: row.get(0)?,
                front: row.get(1)?,
                back: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut cards = Vec::new();
    for row in rows {
        cards.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(cards)
}
