use serde_json::json;
use tauri::State;

use crate::ai::json_extractor::extract_json;
use crate::ai::provider::{chat_completion, read_ai_settings};
use crate::commands::srs::DeckWithStats;
use crate::deck_hub::ocr;
use crate::deck_hub::prompts;
use crate::deck_hub::types::{AnalyzedItem, DeckHubCardInput, OcrResult};
use crate::export::types::ExportResult;
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

// ── Text Analysis ──────────────────────────────────────────

/// Analyze arbitrary text with AI and extract vocabulary/phrases/grammar as deck cards.
#[tauri::command]
pub async fn deck_hub_analyze_text(
    state: State<'_, AppState>,
    text: String,
    source_lang: String,
    target_lang: String,
) -> Result<Vec<AnalyzedItem>, String> {
    let settings = {
        let conn = lock_db(&state)?;
        read_ai_settings(&conn)
    };

    let messages = prompts::build_text_analysis_messages(&text, &source_lang, &target_lang);

    let response = chat_completion(
        &settings.provider,
        &settings.model,
        messages,
        settings.api_key.as_deref(),
        settings.base_url.as_deref(),
        Some(0.3),
        Some(4096),
        true,
    )
    .await?;

    let json_val = extract_json(&response)
        .map_err(|e| format!("Failed to parse AI response: {e}"))?;

    let items_val = json_val
        .get("items")
        .ok_or("AI response missing 'items' key")?;

    let items: Vec<AnalyzedItem> = serde_json::from_value(items_val.clone())
        .map_err(|e| format!("Failed to deserialize items: {e}"))?;

    Ok(items)
}

// ── Batch Create ──────────────────────────────────────────

/// Create a deck with multiple cards in a single SQLite transaction.
#[tauri::command]
pub fn deck_hub_batch_create(
    state: State<'_, AppState>,
    deck_name: String,
    language: String,
    algorithm: String,
    description: Option<String>,
    cards: Vec<DeckHubCardInput>,
) -> Result<DeckWithStats, String> {
    let conn = lock_db(&state)?;

    conn.execute_batch("BEGIN").map_err(|e| format!("Transaction error: {e}"))?;

    let result = (|| -> Result<DeckWithStats, String> {
        // Create deck
        conn.execute(
            "INSERT INTO decks (id, name, description, language, algorithm)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4)",
            rusqlite::params![deck_name, description, language, algorithm],
        )
        .map_err(|e| format!("Deck insert error: {e}"))?;

        let deck_id: String = conn
            .query_row(
                "SELECT id FROM decks WHERE name = ?1 AND language = ?2 ORDER BY created_at DESC LIMIT 1",
                rusqlite::params![deck_name, language],
                |row| row.get(0),
            )
            .map_err(|e| format!("Deck lookup error: {e}"))?;

        let mut inserted = 0i64;

        for card in &cards {
            // Upsert vocabulary
            conn.execute(
                "INSERT INTO vocabulary (word, language, translation, definition, pos, cefr_level, examples, source_module)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'deck_hub')
                 ON CONFLICT(rowid) DO NOTHING",
                rusqlite::params![
                    card.word,
                    language,
                    card.translation,
                    card.definition,
                    card.pos,
                    card.cefr_level,
                    card.example_sentence
                ],
            )
            .map_err(|e| format!("Vocab insert error for '{}': {e}", card.word))?;

            let vocab_id: i64 = conn
                .query_row(
                    "SELECT id FROM vocabulary WHERE word = ?1 AND language = ?2 ORDER BY id DESC LIMIT 1",
                    rusqlite::params![card.word, language],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Vocab lookup error for '{}': {e}", card.word))?;

            let front = card.word.clone();
            let back = card.translation.clone().unwrap_or_default();

            // Build notes JSON (CardNotes format compatible with cloud)
            let notes_json = build_notes_json(card);

            // Insert deck_card (skip if duplicate word in same deck)
            let card_insert_result = conn.execute(
                "INSERT OR IGNORE INTO deck_cards (id, deck_id, vocabulary_id, front, back, notes)
                 VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![deck_id, vocab_id, front, back, notes_json],
            );

            match card_insert_result {
                Ok(rows) if rows > 0 => {
                    let card_id: String = conn
                        .query_row(
                            "SELECT id FROM deck_cards WHERE deck_id = ?1 AND vocabulary_id = ?2",
                            rusqlite::params![deck_id, vocab_id],
                            |row| row.get(0),
                        )
                        .map_err(|e| format!("Card lookup error: {e}"))?;

                    // Create srs_progress
                    conn.execute(
                        "INSERT OR IGNORE INTO srs_progress (id, card_id, algorithm, state, interval_days, due_date)
                         VALUES (lower(hex(randomblob(16))), ?1, ?2, 'new', 0, datetime('now'))",
                        rusqlite::params![card_id, algorithm],
                    )
                    .map_err(|e| format!("Progress insert error: {e}"))?;

                    inserted += 1;
                }
                Ok(_) => {} // Duplicate, skip
                Err(e) => return Err(format!("Card insert error: {e}")),
            }
        }

        // Update card_count
        conn.execute(
            "UPDATE decks SET card_count = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![inserted, deck_id],
        )
        .map_err(|e| format!("Card count update error: {e}"))?;

        // Return DeckWithStats
        let deck = conn
            .query_row(
                "SELECT id, name, description, language, algorithm, card_count, created_at, updated_at
                 FROM decks WHERE id = ?1",
                rusqlite::params![deck_id],
                |row| {
                    Ok(DeckWithStats {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        language: row.get(3)?,
                        algorithm: row.get(4)?,
                        card_count: row.get(5)?,
                        created_at: row.get(6)?,
                        updated_at: row.get(7)?,
                        due_today: 0,
                        new_cards: inserted,
                    })
                },
            )
            .map_err(|e| format!("Deck fetch error: {e}"))?;

        Ok(deck)
    })();

    match result {
        Ok(deck) => {
            conn.execute_batch("COMMIT").map_err(|e| format!("Commit error: {e}"))?;
            Ok(deck)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

/// Build a CardNotes JSON string from DeckHubCardInput (compatible with cloud schema).
fn build_notes_json(card: &DeckHubCardInput) -> Option<String> {
    let mut obj = serde_json::Map::new();
    obj.insert("generated_by".to_string(), json!("deck_hub"));

    if let Some(ref ct) = card.card_type {
        obj.insert("card_type".to_string(), json!(ct));
    }
    if let Some(ref ipa) = card.ipa {
        if !ipa.is_empty() {
            obj.insert("ipa".to_string(), json!(ipa));
        }
    }
    if let Some(ref hook) = card.memory_hook {
        if !hook.is_empty() {
            obj.insert("memory_hook".to_string(), json!(hook));
        }
    }
    if let Some(ref cols) = card.collocations {
        if !cols.is_empty() {
            obj.insert("collocations".to_string(), json!(cols));
        }
    }
    if let Some(ref def) = card.definition {
        obj.insert("definition".to_string(), json!(def));
    }
    if let Some(ref pos) = card.pos {
        obj.insert("part_of_speech".to_string(), json!(pos));
    }
    if let Some(ref cefr) = card.cefr_level {
        obj.insert("cefr_level".to_string(), json!(cefr));
    }

    if obj.len() <= 1 {
        None
    } else {
        serde_json::to_string(&serde_json::Value::Object(obj)).ok()
    }
}

// ── OCR ──────────────────────────────────────────────────

/// Check if Tesseract OCR is installed.
#[tauri::command]
pub fn deck_hub_check_tesseract() -> bool {
    ocr::check_tesseract()
}

/// Get platform-specific Tesseract install instructions.
#[tauri::command]
pub fn deck_hub_tesseract_install_instructions() -> String {
    ocr::install_instructions()
}

/// Install Tesseract via Homebrew (macOS only).
#[tauri::command]
pub async fn deck_hub_install_tesseract() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let output = tokio::process::Command::new("brew")
            .arg("install")
            .arg("tesseract")
            .output()
            .await
            .map_err(|e| format!("Failed to run brew: {e}"))?;

        if output.status.success() {
            Ok("Tesseract installed successfully".to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(format!("Installation failed: {stderr}"))
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(format!(
            "Auto-install not supported on this platform. {}",
            ocr::install_instructions()
        ))
    }
}

/// Run OCR on an image file. Returns extracted text.
#[tauri::command]
pub fn deck_hub_ocr_image(
    image_path: String,
    language: Option<String>,
) -> Result<OcrResult, String> {
    let tess_lang = language
        .as_deref()
        .map(ocr::lang_to_tesseract)
        .unwrap_or("eng");

    ocr::run_ocr(&image_path, Some(tess_lang))
}

// ── Quizlet Export ────────────────────────────────────────

/// Export a deck in Quizlet-compatible tab-separated format (term\tdefinition).
#[tauri::command]
pub fn deck_hub_export_quizlet(
    state: State<'_, AppState>,
    file_path: String,
    deck_id: String,
) -> Result<ExportResult, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT dc.front, dc.back, v.translation
             FROM deck_cards dc
             JOIN vocabulary v ON v.id = dc.vocabulary_id
             WHERE dc.deck_id = ?1
             ORDER BY dc.added_at ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows: Vec<(String, String, Option<String>)> = stmt
        .query_map(rusqlite::params![deck_id], |row| {
            Ok((
                row.get::<_, String>(0).unwrap_or_default(),
                row.get::<_, String>(1).unwrap_or_default(),
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let total = rows.len() as i64;

    let mut content = String::new();
    for (front, back, translation) in &rows {
        let definition = if back.is_empty() {
            translation.as_deref().unwrap_or("")
        } else {
            back.as_str()
        };
        content.push_str(&format!("{}\t{}\n", front, definition));
    }

    std::fs::write(&file_path, content)
        .map_err(|e| format!("File write error: {e}"))?;

    Ok(ExportResult {
        file_path,
        total_items: total,
        format: "quizlet".to_string(),
    })
}

// ── Cloud Sync ────────────────────────────────────────────

/// Push a local deck to the FlexiLingo cloud (Supabase).
/// Requires the user to be authenticated.
#[tauri::command]
pub async fn deck_hub_cloud_push(
    state: State<'_, AppState>,
    deck_id: String,
) -> Result<serde_json::Value, String> {
    // 1. Read deck metadata
    let (deck_name, deck_language, deck_description) = {
        let conn = lock_db(&state)?;
        conn.query_row(
            "SELECT name, language, description FROM decks WHERE id = ?1",
            rusqlite::params![deck_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .map_err(|e| format!("Deck not found: {e}"))?
    };

    // 2. Read all cards
    let cards = {
        let conn = lock_db(&state)?;
        let mut stmt = conn
            .prepare(
                "SELECT dc.front, dc.back, dc.notes, v.translation, v.definition,
                        v.pos, v.cefr_level, v.phonetic, v.examples
                 FROM deck_cards dc
                 JOIN vocabulary v ON v.id = dc.vocabulary_id
                 WHERE dc.deck_id = ?1
                 ORDER BY dc.added_at ASC",
            )
            .map_err(|e| format!("Query error: {e}"))?;

        let result: Vec<_> = stmt
            .query_map(rusqlite::params![deck_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|e| format!("Query error: {e}"))?
            .filter_map(|r| r.ok())
            .collect();
        result
    };

    if cards.is_empty() {
        return Err("Deck has no cards to sync".to_string());
    }

    // 3. Create deck in cloud
    let create_body = json!({
        "title": deck_name,
        "description": deck_description,
        "language_pair": deck_language,
        "is_public": false,
        "source_type": "desk_upload",
    });

    let create_result = crate::auth::supabase_call(
        state.clone(),
        "POST".to_string(),
        "/decks?action=create".to_string(),
        Some(create_body),
    )
    .await?;

    let cloud_deck_id = create_result
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Cloud deck creation failed: no id returned")?
        .to_string();

    // 4. Bulk upload cards
    let cards_payload: Vec<serde_json::Value> = cards
        .iter()
        .map(|(front, back, notes)| {
            json!({
                "front_text": front,
                "back_text": back,
                "notes": notes,
            })
        })
        .collect();

    let bulk_body = json!({
        "deck_id": cloud_deck_id,
        "cards": cards_payload,
    });

    crate::auth::supabase_call(
        state,
        "POST".to_string(),
        "/decks?action=bulk-add-cards".to_string(),
        Some(bulk_body),
    )
    .await?;

    Ok(json!({
        "cloud_deck_id": cloud_deck_id,
        "cards_synced": cards.len(),
        "deck_name": deck_name,
    }))
}
