use serde::{Deserialize, Serialize};
use tauri::State;

use crate::AppState;

// ── IPC Types ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingDocument {
    pub id: String,
    pub title: String,
    pub content: String,
    pub language: String,
    pub source_type: String,
    pub source_url: Option<String>,
    pub word_count: i64,
    pub progress: f64,
    pub last_position: i64,
    pub tokens_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingDocumentSummary {
    pub id: String,
    pub title: String,
    pub language: String,
    pub source_type: String,
    pub word_count: i64,
    pub progress: f64,
    pub highlight_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub text: String,
    pub lower: String,
    pub is_word: bool,
    pub index: usize,
    pub sentence_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingHighlight {
    pub id: String,
    pub document_id: String,
    pub word: String,
    pub sentence: Option<String>,
    pub word_index: Option<i64>,
    pub vocabulary_id: Option<i64>,
    pub created_at: String,
}

// ── Helper ─────────────────────────────────────────────────

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

/// Simple rule-based tokenizer: splits text into words and punctuation tokens.
/// Groups by sentences (split on `.?!` followed by whitespace or end).
fn tokenize_text(text: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut token_index: usize = 0;
    let mut sentence_index: usize = 0;

    let mut chars = text.chars().peekable();
    let mut current_word = String::new();

    while let Some(ch) = chars.next() {
        if ch.is_alphanumeric() || ch == '\'' || ch == '\u{200c}' || ch == '-' {
            // Part of a word (includes apostrophes for English, ZWNJ for Persian, hyphens)
            current_word.push(ch);
        } else {
            // Flush current word if any
            if !current_word.is_empty() {
                let lower = current_word.to_lowercase();
                tokens.push(Token {
                    text: current_word.clone(),
                    lower,
                    is_word: true,
                    index: token_index,
                    sentence_index,
                });
                token_index += 1;
                current_word.clear();
            }

            // Handle non-word characters
            if ch.is_whitespace() {
                // Skip whitespace, don't create token
                continue;
            }

            // Punctuation token
            tokens.push(Token {
                text: ch.to_string(),
                lower: ch.to_string(),
                is_word: false,
                index: token_index,
                sentence_index,
            });
            token_index += 1;

            // Sentence boundary detection
            if matches!(ch, '.' | '?' | '!' | '؟' | '。') {
                // Check if next char is whitespace or end of text (= new sentence)
                if chars.peek().map_or(true, |c| c.is_whitespace()) {
                    sentence_index += 1;
                }
            }
        }
    }

    // Flush last word
    if !current_word.is_empty() {
        let lower = current_word.to_lowercase();
        tokens.push(Token {
            text: current_word,
            lower,
            is_word: true,
            index: token_index,
            sentence_index,
        });
    }

    tokens
}

/// Count words in text (alphanumeric sequences)
fn count_words(text: &str) -> i64 {
    text.split_whitespace()
        .filter(|w| w.chars().any(|c| c.is_alphanumeric()))
        .count() as i64
}

// ── Commands ───────────────────────────────────────────────

#[tauri::command]
pub fn reading_import_text(
    state: State<'_, AppState>,
    title: String,
    content: String,
    language: String,
    source_type: Option<String>,
    source_url: Option<String>,
) -> Result<ReadingDocument, String> {
    let conn = lock_db(&state)?;
    let src = source_type.unwrap_or_else(|| "paste".to_string());
    let word_count = count_words(&content);

    // Tokenize
    let tokens = tokenize_text(&content);
    let tokens_json =
        serde_json::to_string(&tokens).map_err(|e| format!("Tokenize error: {e}"))?;

    conn.execute(
        "INSERT INTO reading_documents (id, title, content, language, source_type, source_url, word_count, tokens_json)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![title, content, language, src, source_url, word_count, tokens_json],
    )
    .map_err(|e| format!("Insert error: {e}"))?;

    // Fetch the newly created document
    conn.query_row(
        "SELECT id, title, content, language, source_type, source_url, word_count,
                progress, last_position, tokens_json, created_at, updated_at
         FROM reading_documents
         ORDER BY created_at DESC LIMIT 1",
        [],
        |row: &rusqlite::Row| {
            Ok(ReadingDocument {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                language: row.get(3)?,
                source_type: row.get(4)?,
                source_url: row.get(5)?,
                word_count: row.get(6)?,
                progress: row.get(7)?,
                last_position: row.get(8)?,
                tokens_json: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
    )
    .map_err(|e| format!("Fetch error: {e}"))
}

#[tauri::command]
pub fn reading_list_documents(
    state: State<'_, AppState>,
    language: Option<String>,
) -> Result<Vec<ReadingDocumentSummary>, String> {
    let conn = lock_db(&state)?;

    let sql = if language.is_some() {
        "SELECT d.id, d.title, d.language, d.source_type, d.word_count,
                d.progress, d.created_at, d.updated_at,
                (SELECT COUNT(*) FROM reading_highlights h WHERE h.document_id = d.id) AS highlight_count
         FROM reading_documents d
         WHERE d.language = ?1
         ORDER BY d.updated_at DESC"
    } else {
        "SELECT d.id, d.title, d.language, d.source_type, d.word_count,
                d.progress, d.created_at, d.updated_at,
                (SELECT COUNT(*) FROM reading_highlights h WHERE h.document_id = d.id) AS highlight_count
         FROM reading_documents d
         ORDER BY d.updated_at DESC"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| format!("Query error: {e}"))?;

    let rows = if let Some(ref lang) = language {
        stmt.query_map(rusqlite::params![lang], map_summary_row)
    } else {
        stmt.query_map([], map_summary_row)
    }
    .map_err(|e| format!("Query error: {e}"))?;

    let mut docs = Vec::new();
    for row in rows {
        docs.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(docs)
}

fn map_summary_row(row: &rusqlite::Row) -> rusqlite::Result<ReadingDocumentSummary> {
    Ok(ReadingDocumentSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        language: row.get(2)?,
        source_type: row.get(3)?,
        word_count: row.get(4)?,
        progress: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        highlight_count: row.get(8)?,
    })
}

#[tauri::command]
pub fn reading_get_document(
    state: State<'_, AppState>,
    id: String,
) -> Result<ReadingDocument, String> {
    let conn = lock_db(&state)?;

    conn.query_row(
        "SELECT id, title, content, language, source_type, source_url, word_count,
                progress, last_position, tokens_json, created_at, updated_at
         FROM reading_documents WHERE id = ?1",
        rusqlite::params![id],
        |row: &rusqlite::Row| {
            Ok(ReadingDocument {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                language: row.get(3)?,
                source_type: row.get(4)?,
                source_url: row.get(5)?,
                word_count: row.get(6)?,
                progress: row.get(7)?,
                last_position: row.get(8)?,
                tokens_json: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
    )
    .map_err(|e| format!("Document not found: {e}"))
}

#[tauri::command]
pub fn reading_delete_document(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM reading_documents WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn reading_update_progress(
    state: State<'_, AppState>,
    id: String,
    progress: f64,
    last_position: i64,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "UPDATE reading_documents SET progress = ?1, last_position = ?2, updated_at = datetime('now')
         WHERE id = ?3",
        rusqlite::params![progress, last_position, id],
    )
    .map_err(|e| format!("Update error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn reading_add_highlight(
    state: State<'_, AppState>,
    document_id: String,
    word: String,
    sentence: Option<String>,
    word_index: Option<i64>,
    vocabulary_id: Option<i64>,
) -> Result<ReadingHighlight, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO reading_highlights (id, document_id, word, sentence, word_index, vocabulary_id)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![document_id, word, sentence, word_index, vocabulary_id],
    )
    .map_err(|e| format!("Insert error: {e}"))?;

    conn.query_row(
        "SELECT id, document_id, word, sentence, word_index, vocabulary_id, created_at
         FROM reading_highlights
         WHERE document_id = ?1 AND word = ?2
         ORDER BY created_at DESC LIMIT 1",
        rusqlite::params![document_id, word],
        |row: &rusqlite::Row| {
            Ok(ReadingHighlight {
                id: row.get(0)?,
                document_id: row.get(1)?,
                word: row.get(2)?,
                sentence: row.get(3)?,
                word_index: row.get(4)?,
                vocabulary_id: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )
    .map_err(|e| format!("Fetch error: {e}"))
}

#[tauri::command]
pub fn reading_get_highlights(
    state: State<'_, AppState>,
    document_id: String,
) -> Result<Vec<ReadingHighlight>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, word, sentence, word_index, vocabulary_id, created_at
             FROM reading_highlights WHERE document_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![document_id], |row: &rusqlite::Row| {
            Ok(ReadingHighlight {
                id: row.get(0)?,
                document_id: row.get(1)?,
                word: row.get(2)?,
                sentence: row.get(3)?,
                word_index: row.get(4)?,
                vocabulary_id: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut highlights = Vec::new();
    for row in rows {
        highlights.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(highlights)
}

#[tauri::command]
pub fn reading_delete_highlight(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM reading_highlights WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

// ── Import from URL ───────────────────────────────────────

#[tauri::command]
pub fn reading_import_url(
    state: State<'_, AppState>,
    url: String,
    title: Option<String>,
    language: Option<String>,
) -> Result<ReadingDocument, String> {
    let conn = lock_db(&state)?;
    let doc_title = title.unwrap_or_else(|| url.clone());
    let lang = language.unwrap_or_else(|| "en".to_string());
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let fetch_url = url.clone();
    let body = std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().map_err(|e| format!("Runtime error: {e}"))?;
        rt.block_on(async {
            let resp = reqwest::get(&fetch_url).await.map_err(|e| format!("Fetch error: {e}"))?;
            resp.text().await.map_err(|e| format!("Read error: {e}"))
        })
    })
    .join()
    .map_err(|_| "Thread join error".to_string())??;

    // Simple HTML tag stripping
    let content = regex::Regex::new(r"<[^>]+>")
        .unwrap()
        .replace_all(&body, " ")
        .to_string();
    let content = content.split_whitespace().collect::<Vec<_>>().join(" ");

    let wc = content.split_whitespace().count() as i64;
    conn.execute(
        "INSERT INTO reading_documents (id, title, content, source_type, source_url, language, word_count, progress, last_position, created_at, updated_at) \
         VALUES (?1, ?2, ?3, 'url', ?4, ?5, ?6, 0.0, 0, ?7, ?7)",
        rusqlite::params![id, doc_title, content, url, lang, wc, now],
    )
    .map_err(|e| format!("Insert error: {e}"))?;

    Ok(ReadingDocument {
        id,
        title: doc_title,
        content,
        source_type: "url".to_string(),
        source_url: Some(url),
        language: lang,
        word_count: wc,
        progress: 0.0,
        last_position: 0,
        tokens_json: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

// ── Import from file ──────────────────────────────────────

#[tauri::command]
pub fn reading_import_file(
    state: State<'_, AppState>,
    file_path: String,
    title: Option<String>,
    language: Option<String>,
) -> Result<ReadingDocument, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("File read error: {e}"))?;

    let file_name = std::path::Path::new(&file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported Document")
        .to_string();

    let doc_title = title.unwrap_or(file_name);
    let lang = language.unwrap_or_else(|| "en".to_string());
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let conn = lock_db(&state)?;

    let wc = content.split_whitespace().count() as i64;
    conn.execute(
        "INSERT INTO reading_documents (id, title, content, source_type, language, word_count, progress, last_position, created_at, updated_at) \
         VALUES (?1, ?2, ?3, 'file', ?4, ?5, 0.0, 0, ?6, ?6)",
        rusqlite::params![id, doc_title, content.trim(), lang, wc, now],
    )
    .map_err(|e| format!("Insert error: {e}"))?;

    Ok(ReadingDocument {
        id,
        title: doc_title,
        content: content.trim().to_string(),
        source_type: "file".to_string(),
        source_url: None,
        language: lang,
        word_count: wc,
        progress: 0.0,
        last_position: 0,
        tokens_json: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

// ── Analyze document ──────────────────────────────────────

#[tauri::command]
pub fn reading_analyze_document(
    state: State<'_, AppState>,
    document_id: String,
) -> Result<serde_json::Value, String> {
    let conn = lock_db(&state)?;

    let content: String = conn
        .query_row(
            "SELECT content FROM reading_documents WHERE id = ?1",
            rusqlite::params![document_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Document not found: {e}"))?;

    let words: Vec<&str> = content.split_whitespace().collect();
    let unique_words: std::collections::HashSet<String> =
        words.iter().map(|w| w.to_lowercase()).collect();
    let total_words = words.len();
    let unique_count = unique_words.len();

    let sentences = content
        .split(|c: char| c == '.' || c == '!' || c == '?')
        .filter(|s| !s.trim().is_empty())
        .count();

    Ok(serde_json::json!({
        "total_words": total_words,
        "unique_words": unique_count,
        "sentence_count": sentences,
        "vocabulary_richness": if total_words > 0 {
            ((unique_count as f64 / total_words as f64) * 100.0).round() / 100.0
        } else { 0.0 },
    }))
}
