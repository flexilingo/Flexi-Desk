use serde_json::json;
use tauri::State;

use crate::ai::json_extractor::extract_json;
use crate::ai::provider::{chat_completion, read_ai_settings};
use crate::commands::srs::{fetch_deck, DeckWithStats};
use crate::deck_hub::ocr;
use crate::deck_hub::prompts;
use crate::deck_hub::types::{AnalyzedItem, DeckHubCardInput, OcrResult};
use crate::export::types::ExportResult;
use crate::AppState;

/// Cards of one deck, flattened for a Quizlet TSV export.
///
/// `LEFT JOIN vocabulary`, not `JOIN`: since migration V032 a card need not be backed by
/// a dictionary word (cloned public decks, grammar cards). An inner join silently omitted
/// those cards from the export file.
pub(crate) const QUIZLET_EXPORT_SQL: &str = "
    SELECT dc.front, dc.back, v.translation
    FROM deck_cards dc
    LEFT JOIN vocabulary v ON v.id = dc.vocabulary_id
    WHERE dc.deck_id = ?1
    ORDER BY dc.order_index ASC, dc.added_at ASC";

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
    native_language: Option<String>,
) -> Result<DeckWithStats, String> {
    let conn = lock_db(&state)?;

    conn.execute_batch("BEGIN").map_err(|e| format!("Transaction error: {e}"))?;

    let result = (|| -> Result<DeckWithStats, String> {
        // Create deck
        let deck_id: String = conn
            .query_row(
                "INSERT INTO decks (id, name, description, language, algorithm, native_language)
                 VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5)
                 RETURNING id",
                rusqlite::params![deck_name, description, language, algorithm, native_language],
                |row| row.get(0),
            )
            .map_err(|e| format!("Deck insert error: {e}"))?;

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
        let deck = fetch_deck(&conn, &deck_id)?;

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

/// Raw bytes of a picked image, for the in-app OCR engine (used when the `tesseract`
/// CLI is not installed, e.g. on Windows). Only image files are read.
#[tauri::command]
pub fn deck_hub_read_image(image_path: String) -> Result<tauri::ipc::Response, String> {
    crate::commands::path_grants::require(&image_path)?;
    if !is_image_path(&image_path) {
        return Err("NOT_AN_IMAGE".to_string());
    }
    let bytes = std::fs::read(&image_path).map_err(|e| format!("Failed to read image: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

fn is_image_path(path: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| matches!(e.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tif" | "tiff"))
        .unwrap_or(false)
}

#[cfg(test)]
mod image_path_tests {
    use super::*;

    #[test]
    fn only_image_extensions_are_readable() {
        assert!(is_image_path("C:\\pics\\Scan.JPG"));
        assert!(is_image_path("/tmp/a.webp"));
        assert!(!is_image_path("/etc/passwd"));
        assert!(!is_image_path("/tmp/notes.txt"));
        assert!(!is_image_path("/tmp/png"));
    }
}

/// Run OCR on an image file. Returns extracted text.
#[tauri::command]
pub fn deck_hub_ocr_image(
    image_path: String,
    language: Option<String>,
) -> Result<OcrResult, String> {
    crate::commands::path_grants::require(&image_path)?;
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
    crate::commands::path_grants::require(&file_path)?;
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            QUIZLET_EXPORT_SQL,
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
