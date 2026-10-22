//! SQLite access for the Reader. Every function takes a `&Connection`, so the commands stay
//! thin and the tests run against in-memory databases. Errors are cloud-style codes
//! (`DOCUMENT_NOT_FOUND`, `NOTE_SAVE_FAILED`, ...) that the front resolves through i18n.

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::*;

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn iso(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn db_err(code: &'static str) -> impl Fn(rusqlite::Error) -> String {
    move |_| code.to_string()
}

// ── Documents ────────────────────────────────────────────────────────────────

/// Mirrors the front's `ReaderDocument` (`readerApi.ts`) field for field, plus `finished_at`.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ReaderDocument {
    pub id: String,
    pub title: String,
    pub original_filename: String,
    pub source_kind: String,
    pub byte_size: i64,
    pub page_count: Option<i64>,
    pub word_count: Option<i64>,
    pub language: String,
    pub extraction_method: Option<String>,
    /// Always `ready` here: nothing is uploaded, so nothing is ever "processing".
    pub status: String,
    pub error_code: Option<String>,
    pub last_page: i64,
    pub last_scroll_pct: i64,
    pub last_read_at: Option<String>,
    pub created_at: String,
    /// Always true: the file stays on this computer, so it can always be read as real pages.
    pub keep_original: bool,
    pub book_edition: Option<String>,
    pub text_layer_status: Option<String>,
    pub text_layer_pages_done: Option<i64>,
    pub text_layer_pages_total: Option<i64>,
    pub finished_at: Option<String>,
}

const DOC_COLS: &str = "id, title, original_filename, kind AS source_kind, size_bytes AS byte_size, \
    page_count, word_count, language, extraction_method, last_page, last_scroll_pct, last_read_at, \
    created_at, book_edition, text_layer_status, text_layer_pages_done, text_layer_pages_total, finished_at";

fn doc_from_row(r: &Row) -> rusqlite::Result<ReaderDocument> {
    Ok(ReaderDocument {
        id: r.get("id")?,
        title: r.get("title")?,
        original_filename: r.get("original_filename")?,
        source_kind: r.get("source_kind")?,
        byte_size: r.get("byte_size")?,
        page_count: r.get("page_count")?,
        word_count: r.get("word_count")?,
        language: r.get("language")?,
        extraction_method: r.get("extraction_method")?,
        status: "ready".to_string(),
        error_code: None,
        last_page: r.get("last_page")?,
        last_scroll_pct: r.get("last_scroll_pct")?,
        last_read_at: r.get("last_read_at")?,
        created_at: r.get("created_at")?,
        keep_original: true,
        book_edition: r.get("book_edition")?,
        text_layer_status: r.get("text_layer_status")?,
        text_layer_pages_done: r.get("text_layer_pages_done")?,
        text_layer_pages_total: r.get("text_layer_pages_total")?,
        finished_at: r.get("finished_at")?,
    })
}

pub struct NewDocument<'a> {
    pub id: &'a str,
    pub file_name: Option<&'a str>,
    pub title: Option<&'a str>,
    pub kind: &'a str,
    pub stored_file: &'a str,
    pub size_bytes: i64,
    pub language: Option<&'a str>,
}

pub fn insert_document(conn: &Connection, d: &NewDocument) -> Result<ReaderDocument, String> {
    if d.kind != "pdf" && d.kind != "image" {
        return Err("INVALID_REQUEST".to_string());
    }
    let title = match d.title.map(str::trim).filter(|t| !t.is_empty()) {
        Some(t) => t.chars().take(MAX_TITLE_CHARS).collect(),
        None => title_from_file_name(d.file_name),
    };
    let language = normalise_language(d.language, "en");
    let filename = safe_file_name(d.file_name, d.kind);
    conn.execute(
        "INSERT INTO reader_documents (id, title, original_filename, kind, file_path, size_bytes, language)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![d.id, title, filename, d.kind, d.stored_file, d.size_bytes, language],
    )
    .map_err(db_err("DOCUMENT_CREATE_FAILED"))?;
    get_document(conn, d.id)
}

pub fn get_document(conn: &Connection, id: &str) -> Result<ReaderDocument, String> {
    conn.query_row(
        &format!("SELECT {DOC_COLS} FROM reader_documents WHERE id = ?1"),
        params![id],
        doc_from_row,
    )
    .optional()
    .map_err(db_err("DOCUMENT_FETCH_FAILED"))?
    .ok_or_else(|| "DOCUMENT_NOT_FOUND".to_string())
}

pub fn require_document(conn: &Connection, id: &str) -> Result<(), String> {
    get_document_exists(conn, id).then_some(()).ok_or_else(|| "DOCUMENT_NOT_FOUND".to_string())
}

fn get_document_exists(conn: &Connection, id: &str) -> bool {
    conn.query_row("SELECT 1 FROM reader_documents WHERE id = ?1", params![id], |_| Ok(()))
        .optional()
        .map(|o| o.is_some())
        .unwrap_or(false)
}

#[derive(Debug, Serialize)]
pub struct DocumentList {
    pub items: Vec<ReaderDocument>,
    pub total: i64,
}

/// Newest first, like `reader?action=list`.
pub fn list_documents(conn: &Connection) -> Result<DocumentList, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {DOC_COLS} FROM reader_documents ORDER BY created_at DESC, rowid DESC"))
        .map_err(db_err("DOCUMENTS_FETCH_FAILED"))?;
    let items = stmt
        .query_map([], doc_from_row)
        .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        .map_err(db_err("DOCUMENTS_FETCH_FAILED"))?;
    let total = items.len() as i64;
    Ok(DocumentList { items, total })
}

/// Documents with exactly this byte size — the duplicate check before an import.
pub fn find_by_size(conn: &Connection, size_bytes: i64) -> Result<Vec<ReaderDocument>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {DOC_COLS} FROM reader_documents WHERE size_bytes = ?1 AND kind != 'text' ORDER BY created_at DESC, rowid DESC"))
        .map_err(db_err("DOCUMENTS_FETCH_FAILED"))?;
    stmt.query_map(params![size_bytes], doc_from_row)
        .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        .map_err(db_err("DOCUMENTS_FETCH_FAILED"))
}

#[derive(Debug, Serialize)]
pub struct RenameResult {
    pub ok: bool,
    pub title: String,
}

pub fn rename(conn: &Connection, id: &str, title: &str) -> Result<RenameResult, String> {
    let title: String = title.trim().chars().take(MAX_TITLE_CHARS).collect();
    if title.is_empty() {
        return Err("INVALID_REQUEST".to_string());
    }
    let n = conn
        .execute(
            "UPDATE reader_documents SET title = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, title, now_iso()],
        )
        .map_err(db_err("RENAME_FAILED"))?;
    if n == 0 {
        return Err("DOCUMENT_NOT_FOUND".to_string());
    }
    Ok(RenameResult { ok: true, title })
}

#[derive(Debug, Serialize)]
pub struct PositionResult {
    pub ok: bool,
    pub last_page: i64,
}

/// Remember where the reader stopped. Clamped into the document's real range when the page
/// count is known; `finished` (when given) sets or clears `finished_at`.
pub fn set_position(
    conn: &Connection,
    id: &str,
    page: Option<f64>,
    scroll_pct: Option<f64>,
    finished: Option<bool>,
) -> Result<PositionResult, String> {
    let page_count: Option<i64> = conn
        .query_row("SELECT page_count FROM reader_documents WHERE id = ?1", params![id], |r| r.get(0))
        .optional()
        .map_err(db_err("POSITION_SAVE_FAILED"))?
        .ok_or_else(|| "DOCUMENT_NOT_FOUND".to_string())?;

    let mut last_page = page_number(page);
    if let Some(pc) = page_count.filter(|p| *p >= 1) {
        last_page = last_page.min(pc);
    }
    let pct = clamp(scroll_pct, 0.0, 100.0, 0.0).round() as i64;
    let now = now_iso();
    let finished_at: Option<Option<String>> = finished.map(|f| f.then(|| now.clone()));

    match finished_at {
        Some(f) => conn.execute(
            "UPDATE reader_documents SET last_page = ?2, last_scroll_pct = ?3, last_read_at = ?4, finished_at = ?5 WHERE id = ?1",
            params![id, last_page, pct, now, f],
        ),
        None => conn.execute(
            "UPDATE reader_documents SET last_page = ?2, last_scroll_pct = ?3, last_read_at = ?4 WHERE id = ?1",
            params![id, last_page, pct, now],
        ),
    }
    .map_err(db_err("POSITION_SAVE_FAILED"))?;
    Ok(PositionResult { ok: true, last_page })
}

#[derive(Debug, Serialize)]
pub struct LanguageResult {
    pub ok: bool,
    pub language: String,
}

pub fn set_language(conn: &Connection, id: &str, language: &str) -> Result<LanguageResult, String> {
    let normalised = normalise_language(Some(language), "");
    if normalised.is_empty() {
        return Err("INVALID_REQUEST".to_string());
    }
    let n = conn
        .execute(
            "UPDATE reader_documents SET language = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, normalised, now_iso()],
        )
        .map_err(db_err("DOCUMENT_UPDATE_FAILED"))?;
    if n == 0 {
        return Err("DOCUMENT_NOT_FOUND".to_string());
    }
    Ok(LanguageResult { ok: true, language: normalised })
}

#[derive(Debug, Serialize)]
pub struct EditionResult {
    pub ok: bool,
    pub book_edition: Option<String>,
}

/// Name the published book a document is, or clear it (blank / null).
pub fn set_edition(conn: &Connection, id: &str, edition: Option<&str>) -> Result<EditionResult, String> {
    let edition: Option<String> = edition
        .map(|e| e.trim().chars().take(MAX_EDITION_CHARS).collect::<String>())
        .filter(|e| !e.is_empty());
    let n = conn
        .execute(
            "UPDATE reader_documents SET book_edition = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, edition, now_iso()],
        )
        .map_err(db_err("DOCUMENT_UPDATE_FAILED"))?;
    if n == 0 {
        return Err("DOCUMENT_NOT_FOUND".to_string());
    }
    Ok(EditionResult { ok: true, book_edition: edition })
}

/// The viewer learns the page count when pdf.js opens the file.
pub fn set_page_count(conn: &Connection, id: &str, page_count: i64) -> Result<(), String> {
    if page_count < 1 {
        return Err("INVALID_REQUEST".to_string());
    }
    let n = conn
        .execute(
            "UPDATE reader_documents SET page_count = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, page_count, now_iso()],
        )
        .map_err(db_err("DOCUMENT_UPDATE_FAILED"))?;
    if n == 0 {
        return Err("DOCUMENT_NOT_FOUND".to_string());
    }
    Ok(())
}

/// The stored file name (not yet an absolute path) of a document.
pub fn stored_file(conn: &Connection, id: &str) -> Result<String, String> {
    conn.query_row("SELECT file_path FROM reader_documents WHERE id = ?1", params![id], |r| r.get(0))
        .optional()
        .map_err(db_err("DOCUMENT_FETCH_FAILED"))?
        .ok_or_else(|| "DOCUMENT_NOT_FOUND".to_string())
}

// ── Text documents (pasted text, web pages) ──────────────────────────────────

pub struct NewTextDocument<'a> {
    pub id: &'a str,
    pub title: &'a str,
    /// Shown as the "file name": `pasted-text.txt`, or the page's host.
    pub source_name: &'a str,
    pub language: &'a str,
    pub pages: &'a [String],
}

/// Insert a text document and all its pages in one transaction.
pub fn insert_text_document(conn: &Connection, d: &NewTextDocument) -> Result<ReaderDocument, String> {
    if d.pages.is_empty() {
        return Err("EMPTY_TEXT".to_string());
    }
    let title: String = {
        let t = d.title.trim();
        let t = if t.is_empty() { "Text" } else { t };
        t.chars().take(MAX_TITLE_CHARS).collect()
    };
    let words: i64 = d.pages.iter().map(|p| text::count_words(p, d.language)).sum();
    let bytes: i64 = d.pages.iter().map(|p| p.len() as i64).sum();
    let tx = conn.unchecked_transaction().map_err(db_err("DOCUMENT_CREATE_FAILED"))?;
    tx.execute(
        "INSERT INTO reader_documents (id, title, original_filename, kind, file_path, size_bytes, language,
                                       page_count, word_count, extraction_method)
         VALUES (?1, ?2, ?3, 'text', '', ?4, ?5, ?6, ?7, 'text')",
        params![d.id, title, safe_file_name(Some(d.source_name), "text"), bytes, d.language, d.pages.len() as i64, words],
    )
    .map_err(db_err("DOCUMENT_CREATE_FAILED"))?;
    for (i, content) in d.pages.iter().enumerate() {
        tx.execute(
            "INSERT INTO reader_text_pages (document_id, page, content) VALUES (?1, ?2, ?3)",
            params![d.id, (i + 1) as i64, content],
        )
        .map_err(db_err("DOCUMENT_CREATE_FAILED"))?;
    }
    tx.commit().map_err(db_err("DOCUMENT_CREATE_FAILED"))?;
    get_document(conn, d.id)
}

/// One page of a text document, in the shape of the cloud's `reader?action=page`.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ReaderTextPage {
    pub document_id: String,
    pub title: String,
    pub language: String,
    pub page_number: i64,
    pub page_count: i64,
    pub content: String,
    pub word_count: i64,
    pub char_count: i64,
    pub truncated: bool,
    pub has_prev: bool,
    pub has_next: bool,
}

/// A page of a text document. A page number outside the document is clamped into it, so a
/// bookmark that is too large still opens the last page.
pub fn get_text_page(conn: &Connection, id: &str, page: Option<f64>) -> Result<ReaderTextPage, String> {
    let doc = get_document(conn, id)?;
    if doc.source_kind != "text" {
        return Err("DOCUMENT_NOT_FOUND".to_string());
    }
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM reader_text_pages WHERE document_id = ?1", params![id], |r| r.get(0))
        .map_err(db_err("PAGE_FETCH_FAILED"))?;
    if total == 0 {
        return Err("PAGE_NOT_FOUND".to_string());
    }
    let n = page_number(page).min(total);
    let content: String = conn
        .query_row(
            "SELECT content FROM reader_text_pages WHERE document_id = ?1 AND page = ?2",
            params![id, n],
            |r| r.get(0),
        )
        .map_err(db_err("PAGE_FETCH_FAILED"))?;
    Ok(ReaderTextPage {
        document_id: doc.id,
        title: doc.title,
        word_count: text::count_words(&content, &doc.language),
        char_count: content.chars().count() as i64,
        language: doc.language,
        page_number: n,
        page_count: total,
        content,
        truncated: false,
        has_prev: n > 1,
        has_next: n < total,
    })
}

/// Delete the rows; every dependent table goes with them by cascade. The caller removes the
/// file FIRST (a row deleted before its file leaves a file nothing knows about).
pub fn delete_rows(conn: &Connection, id: &str) -> Result<(), String> {
    let n = conn
        .execute("DELETE FROM reader_documents WHERE id = ?1", params![id])
        .map_err(db_err("DELETE_FAILED"))?;
    if n == 0 {
        return Err("DOCUMENT_NOT_FOUND".to_string());
    }
    Ok(())
}

// ── Sessions and word log ────────────────────────────────────────────────────

#[derive(Debug, Serialize, PartialEq)]
pub struct SessionStart {
    pub session_id: String,
    pub resumed: bool,
}

/// Resume the document's session if the reader was last seen less than 90 minutes ago.
pub fn start_session(
    conn: &Connection,
    document_id: &str,
    page: Option<f64>,
    page_count: Option<f64>,
    now: DateTime<Utc>,
) -> Result<SessionStart, String> {
    let stored_count: Option<i64> = conn
        .query_row("SELECT page_count FROM reader_documents WHERE id = ?1", params![document_id], |r| r.get(0))
        .optional()
        .map_err(db_err("SESSION_START_FAILED"))?
        .ok_or_else(|| "DOCUMENT_NOT_FOUND".to_string())?;

    let reported = page_count.filter(|p| p.is_finite() && *p >= 1.0).map(|p| p.floor() as i64);
    if let (Some(pc), None) = (reported, stored_count) {
        set_page_count(conn, document_id, pc)?;
    }

    let page = page_number(page);
    let cutoff = iso(now - Duration::minutes(SESSION_IDLE_MINUTES));
    let open: Option<String> = conn
        .query_row(
            "SELECT id FROM reader_sessions WHERE document_id = ?1 AND last_seen_at >= ?2
             ORDER BY last_seen_at DESC, rowid DESC LIMIT 1",
            params![document_id, cutoff],
            |r| r.get(0),
        )
        .optional()
        .map_err(db_err("SESSION_START_FAILED"))?;

    if let Some(id) = open {
        conn.execute(
            "UPDATE reader_sessions SET last_seen_at = ?2, end_page = ?3 WHERE id = ?1",
            params![id, iso(now), page],
        )
        .map_err(db_err("SESSION_START_FAILED"))?;
        return Ok(SessionStart { session_id: id, resumed: true });
    }

    let id = new_id();
    conn.execute(
        "INSERT INTO reader_sessions (id, document_id, started_at, last_seen_at, start_page, end_page)
         VALUES (?1, ?2, ?3, ?3, ?4, ?4)",
        params![id, document_id, iso(now), page],
    )
    .map_err(db_err("SESSION_START_FAILED"))?;
    Ok(SessionStart { session_id: id, resumed: false })
}

/// Log one opened word. Repetition is the signal, so nothing is deduplicated.
pub fn log_word(
    conn: &Connection,
    document_id: &str,
    session_id: Option<&str>,
    word: &str,
    context: Option<&str>,
    page: Option<f64>,
) -> Result<(), String> {
    let word: String = word.trim().chars().take(MAX_WORD_CHARS).collect();
    if word.is_empty() {
        return Err("INVALID_REQUEST".to_string());
    }
    let language: String = conn
        .query_row("SELECT language FROM reader_documents WHERE id = ?1", params![document_id], |r| r.get(0))
        .optional()
        .map_err(db_err("WORD_LOG_FAILED"))?
        .ok_or_else(|| "DOCUMENT_NOT_FOUND".to_string())?;

    // A session id that is not this document's is dropped rather than trusted.
    let session_id: Option<String> = match session_id {
        Some(s) => conn
            .query_row(
                "SELECT id FROM reader_sessions WHERE id = ?1 AND document_id = ?2",
                params![s, document_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(db_err("WORD_LOG_FAILED"))?,
        None => None,
    };

    let page = page_number(page);
    let context: Option<String> = context
        .map(|c| c.trim().chars().take(MAX_CONTEXT_CHARS).collect::<String>())
        .filter(|c| !c.is_empty());
    let now = now_iso();
    conn.execute(
        "INSERT INTO reader_word_log (id, document_id, session_id, word, word_key, context, page, language, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![new_id(), document_id, session_id, word, word.to_lowercase(), context, page, language, now],
    )
    .map_err(db_err("WORD_LOG_FAILED"))?;

    if let Some(s) = session_id {
        conn.execute(
            "UPDATE reader_sessions SET last_seen_at = ?2, end_page = ?3, word_count = word_count + 1 WHERE id = ?1",
            params![s, now, page],
        )
        .map_err(db_err("WORD_LOG_FAILED"))?;
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct WordsResult {
    pub items: Vec<WordSummary>,
    pub total_events: i64,
}

/// `reader?action=words`: the newest 1000 events, folded per word.
pub fn words(conn: &Connection, document_id: &str, session_id: Option<&str>) -> Result<WordsResult, String> {
    require_document(conn, document_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT word, word_key, context, page, created_at FROM reader_word_log
             WHERE document_id = ?1 AND (?2 IS NULL OR session_id = ?2)
             ORDER BY created_at DESC, rowid DESC LIMIT 1000",
        )
        .map_err(db_err("WORDS_FETCH_FAILED"))?;
    let events = stmt
        .query_map(params![document_id, session_id], |r| {
            Ok(WordEvent {
                word: r.get(0)?,
                word_key: r.get(1)?,
                context: r.get(2)?,
                page: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        .map_err(db_err("WORDS_FETCH_FAILED"))?;
    Ok(WordsResult { total_events: events.len() as i64, items: group_words(&events) })
}

// ── Notes ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, PartialEq)]
pub struct ReaderNote {
    pub id: String,
    pub page_number: i64,
    pub quote: String,
    pub body: String,
    pub run_start: Option<i64>,
    pub run_end: Option<i64>,
    pub rect_x: f64,
    pub rect_y: f64,
    pub rect_w: f64,
    pub rect_h: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct Items<T> {
    pub items: Vec<T>,
}

pub fn list_notes(conn: &Connection, document_id: &str) -> Result<Items<ReaderNote>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, page_number, quote, body, run_start, run_end, rect_x, rect_y, rect_w, rect_h, created_at, updated_at
             FROM reader_notes WHERE document_id = ?1 ORDER BY page_number ASC, created_at ASC, rowid ASC LIMIT 2000",
        )
        .map_err(db_err("NOTES_FETCH_FAILED"))?;
    let items = stmt
        .query_map(params![document_id], |r| {
            Ok(ReaderNote {
                id: r.get(0)?,
                page_number: r.get(1)?,
                quote: r.get(2)?,
                body: r.get(3)?,
                run_start: r.get(4)?,
                run_end: r.get(5)?,
                rect_x: r.get(6)?,
                rect_y: r.get(7)?,
                rect_w: r.get(8)?,
                rect_h: r.get(9)?,
                created_at: r.get(10)?,
                updated_at: r.get(11)?,
            })
        })
        .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        .map_err(db_err("NOTES_FETCH_FAILED"))?;
    Ok(Items { items })
}

#[derive(Debug, Deserialize, Default)]
pub struct Rect {
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub w: Option<f64>,
    pub h: Option<f64>,
}

/// Same body as the front's `saveReaderNote` mutation.
#[derive(Debug, Deserialize)]
pub struct SaveNote {
    pub id: Option<String>,
    pub document_id: String,
    pub page: Option<f64>,
    pub quote: Option<String>,
    pub body: Option<String>,
    pub run_start: Option<i64>,
    pub run_end: Option<i64>,
    pub rect: Option<Rect>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Saved {
    pub id: String,
}

pub fn save_note(conn: &Connection, n: &SaveNote) -> Result<Saved, String> {
    require_document(conn, &n.document_id)?;
    let pct = |v: Option<f64>| clamp(v, 0.0, 100.0, 0.0);
    let rect = n.rect.as_ref();
    let quote: String = n.quote.as_deref().unwrap_or("").chars().take(2000).collect();
    let body: String = n.body.as_deref().unwrap_or("").chars().take(8000).collect();
    let page = page_number(n.page);
    let now = now_iso();
    let (rx, ry, rw, rh) = (
        pct(rect.and_then(|r| r.x)),
        pct(rect.and_then(|r| r.y)),
        pct(rect.and_then(|r| r.w)),
        pct(rect.and_then(|r| r.h)),
    );
    match &n.id {
        Some(id) => {
            let changed = conn
                .execute(
                    "UPDATE reader_notes SET page_number = ?3, quote = ?4, body = ?5, run_start = ?6, run_end = ?7,
                        rect_x = ?8, rect_y = ?9, rect_w = ?10, rect_h = ?11, updated_at = ?12
                     WHERE id = ?1 AND document_id = ?2",
                    params![id, n.document_id, page, quote, body, n.run_start, n.run_end, rx, ry, rw, rh, now],
                )
                .map_err(db_err("NOTE_SAVE_FAILED"))?;
            if changed == 0 {
                return Err("NOTE_SAVE_FAILED".to_string());
            }
            Ok(Saved { id: id.clone() })
        }
        None => {
            let id = new_id();
            conn.execute(
                "INSERT INTO reader_notes (id, document_id, page_number, quote, body, run_start, run_end,
                    rect_x, rect_y, rect_w, rect_h, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
                params![id, n.document_id, page, quote, body, n.run_start, n.run_end, rx, ry, rw, rh, now],
            )
            .map_err(db_err("NOTE_SAVE_FAILED"))?;
            Ok(Saved { id })
        }
    }
}

#[derive(Debug, Serialize)]
pub struct OkResult {
    pub ok: bool,
}

pub fn delete_note(conn: &Connection, id: &str) -> Result<OkResult, String> {
    conn.execute("DELETE FROM reader_notes WHERE id = ?1", params![id]).map_err(db_err("NOTE_DELETE_FAILED"))?;
    Ok(OkResult { ok: true })
}

// ── Text boxes ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, PartialEq)]
pub struct ReaderTextBox {
    pub id: String,
    pub page_number: i64,
    pub body: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub font_size: f64,
    pub color: String,
    pub bold: bool,
    pub background: bool,
    pub updated_at: String,
}

pub fn list_text_boxes(conn: &Connection, document_id: &str) -> Result<Items<ReaderTextBox>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, page_number, body, x, y, w, font_size, color, bold, background, updated_at
             FROM reader_text_boxes WHERE document_id = ?1 ORDER BY page_number ASC, created_at ASC, rowid ASC LIMIT 5000",
        )
        .map_err(db_err("TEXT_BOXES_FETCH_FAILED"))?;
    let items = stmt
        .query_map(params![document_id], |r| {
            Ok(ReaderTextBox {
                id: r.get(0)?,
                page_number: r.get(1)?,
                body: r.get(2)?,
                x: r.get(3)?,
                y: r.get(4)?,
                w: r.get(5)?,
                font_size: r.get(6)?,
                color: r.get(7)?,
                bold: r.get(8)?,
                background: r.get(9)?,
                updated_at: r.get(10)?,
            })
        })
        .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        .map_err(db_err("TEXT_BOXES_FETCH_FAILED"))?;
    Ok(Items { items })
}

/// Same body as the front's `saveReaderTextBox` mutation.
#[derive(Debug, Deserialize)]
pub struct SaveTextBox {
    pub id: Option<String>,
    pub document_id: String,
    pub page: Option<f64>,
    pub body: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub w: Option<f64>,
    pub font_size: Option<f64>,
    pub color: Option<String>,
    pub bold: Option<bool>,
    pub background: Option<bool>,
}

pub fn save_text_box(conn: &Connection, t: &SaveTextBox) -> Result<Saved, String> {
    require_document(conn, &t.document_id)?;
    let body: String = t.body.as_deref().unwrap_or("").chars().take(2000).collect();
    let (x, y) = (clamp(t.x, 0.0, 100.0, 0.0), clamp(t.y, 0.0, 100.0, 0.0));
    let w = clamp(t.w, 1.0, 100.0, 20.0);
    let font_size = clamp(t.font_size, 0.3, 10.0, 1.6);
    let color = ink_or_default(t.color.as_deref());
    let (bold, background) = (t.bold == Some(true), t.background == Some(true));
    let page = page_number(t.page);
    let now = now_iso();
    match &t.id {
        Some(id) => {
            let changed = conn
                .execute(
                    "UPDATE reader_text_boxes SET page_number = ?3, body = ?4, x = ?5, y = ?6, w = ?7, font_size = ?8,
                        color = ?9, bold = ?10, background = ?11, updated_at = ?12
                     WHERE id = ?1 AND document_id = ?2",
                    params![id, t.document_id, page, body, x, y, w, font_size, color, bold, background, now],
                )
                .map_err(db_err("TEXT_BOX_SAVE_FAILED"))?;
            if changed == 0 {
                return Err("TEXT_BOX_SAVE_FAILED".to_string());
            }
            Ok(Saved { id: id.clone() })
        }
        None => {
            let id = new_id();
            conn.execute(
                "INSERT INTO reader_text_boxes (id, document_id, page_number, body, x, y, w, font_size, color, bold, background, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
                params![id, t.document_id, page, body, x, y, w, font_size, color, bold, background, now],
            )
            .map_err(db_err("TEXT_BOX_SAVE_FAILED"))?;
            Ok(Saved { id })
        }
    }
}

pub fn delete_text_box(conn: &Connection, id: &str) -> Result<OkResult, String> {
    conn.execute("DELETE FROM reader_text_boxes WHERE id = ?1", params![id])
        .map_err(db_err("TEXT_BOX_DELETE_FAILED"))?;
    Ok(OkResult { ok: true })
}

// ── Marks ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, PartialEq)]
pub struct ReaderMark {
    pub id: String,
    pub page_number: i64,
    pub kind: String,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub size: f64,
    pub color: String,
    pub updated_at: String,
}

pub fn list_marks(conn: &Connection, document_id: &str) -> Result<Items<ReaderMark>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, page_number, kind, x1, y1, x2, y2, size, color, updated_at
             FROM reader_marks WHERE document_id = ?1 ORDER BY page_number ASC, created_at ASC, rowid ASC LIMIT 5000",
        )
        .map_err(db_err("MARKS_FETCH_FAILED"))?;
    let items = stmt
        .query_map(params![document_id], |r| {
            Ok(ReaderMark {
                id: r.get(0)?,
                page_number: r.get(1)?,
                kind: r.get(2)?,
                x1: r.get(3)?,
                y1: r.get(4)?,
                x2: r.get(5)?,
                y2: r.get(6)?,
                size: r.get(7)?,
                color: r.get(8)?,
                updated_at: r.get(9)?,
            })
        })
        .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        .map_err(db_err("MARKS_FETCH_FAILED"))?;
    Ok(Items { items })
}

/// Same body as the front's `saveReaderMark` mutation.
#[derive(Debug, Deserialize)]
pub struct SaveMark {
    pub id: Option<String>,
    pub document_id: String,
    pub page: Option<f64>,
    pub kind: Option<String>,
    pub x1: Option<f64>,
    pub y1: Option<f64>,
    pub x2: Option<f64>,
    pub y2: Option<f64>,
    pub size: Option<f64>,
    pub color: Option<String>,
}

pub fn save_mark(conn: &Connection, m: &SaveMark) -> Result<Saved, String> {
    let kind = m.kind.as_deref().unwrap_or("");
    if !is_mark_kind(kind) {
        return Err("INVALID_REQUEST".to_string());
    }
    require_document(conn, &m.document_id)?;
    let pt = |v: Option<f64>| clamp(v, 0.0, 100.0, 0.0);
    let (x1, y1, x2, y2) = (pt(m.x1), pt(m.y1), pt(m.x2), pt(m.y2));
    let size = clamp(m.size, 0.3, 10.0, 1.6);
    let color = ink_or_default(m.color.as_deref());
    let page = page_number(m.page);
    let now = now_iso();
    match &m.id {
        Some(id) => {
            let changed = conn
                .execute(
                    "UPDATE reader_marks SET page_number = ?3, kind = ?4, x1 = ?5, y1 = ?6, x2 = ?7, y2 = ?8,
                        size = ?9, color = ?10, updated_at = ?11
                     WHERE id = ?1 AND document_id = ?2",
                    params![id, m.document_id, page, kind, x1, y1, x2, y2, size, color, now],
                )
                .map_err(db_err("MARK_SAVE_FAILED"))?;
            if changed == 0 {
                return Err("MARK_SAVE_FAILED".to_string());
            }
            Ok(Saved { id: id.clone() })
        }
        None => {
            let id = new_id();
            conn.execute(
                "INSERT INTO reader_marks (id, document_id, page_number, kind, x1, y1, x2, y2, size, color, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
                params![id, m.document_id, page, kind, x1, y1, x2, y2, size, color, now],
            )
            .map_err(db_err("MARK_SAVE_FAILED"))?;
            Ok(Saved { id })
        }
    }
}

pub fn delete_mark(conn: &Connection, id: &str) -> Result<OkResult, String> {
    conn.execute("DELETE FROM reader_marks WHERE id = ?1", params![id]).map_err(db_err("MARK_DELETE_FAILED"))?;
    Ok(OkResult { ok: true })
}

// ── OCR text layer ───────────────────────────────────────────────────────────

/// Mirrors the front's `ReaderTextLayerPage`: the document's layer state, plus one page's words.
#[derive(Debug, Serialize, PartialEq)]
pub struct TextLayerPage {
    pub status: Option<String>,
    pub pages_done: i64,
    pub pages_total: Option<i64>,
    pub error_code: Option<String>,
    pub scope: Option<String>,
    pub page: Option<i64>,
    pub words: Option<Value>,
}

fn ready_count(conn: &Connection, document_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM reader_ocr_pages WHERE document_id = ?1 AND status = 'ready'",
        params![document_id],
        |r| r.get(0),
    )
    .map_err(db_err("TEXT_LAYER_FETCH_FAILED"))
}

fn layer_state(conn: &Connection, document_id: &str) -> Result<TextLayerPage, String> {
    let (status, total, error): (Option<String>, Option<i64>, Option<String>) = conn
        .query_row(
            "SELECT text_layer_status, text_layer_pages_total, text_layer_error FROM reader_documents WHERE id = ?1",
            params![document_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(db_err("TEXT_LAYER_FETCH_FAILED"))?
        .ok_or_else(|| "DOCUMENT_NOT_FOUND".to_string())?;
    Ok(TextLayerPage {
        status,
        pages_done: ready_count(conn, document_id)?,
        pages_total: total,
        error_code: error,
        scope: None,
        page: None,
        words: None,
    })
}

/// `reader?action=text-layer`: the state alone (`page` None), or with one page's words.
pub fn get_ocr_page(conn: &Connection, document_id: &str, page: Option<i64>) -> Result<TextLayerPage, String> {
    let mut out = layer_state(conn, document_id)?;
    if let Some(p) = page.filter(|p| *p >= 1) {
        out.page = Some(p);
        let json: Option<String> = conn
            .query_row(
                "SELECT words_json FROM reader_ocr_pages WHERE document_id = ?1 AND page = ?2 AND status = 'ready'",
                params![document_id, p],
                |r| r.get(0),
            )
            .optional()
            .map_err(db_err("TEXT_LAYER_FETCH_FAILED"))?
            .flatten();
        out.words = json.and_then(|j| serde_json::from_str(&j).ok());
    }
    Ok(out)
}

#[derive(Debug, Deserialize)]
pub struct SaveOcrPage {
    pub document_id: String,
    pub page: i64,
    /// The `OcrWords` object. Absent when the page failed.
    pub words: Option<Value>,
    pub error_code: Option<String>,
}

/// Store one page's OCR words (or record that reading it failed). When every page of a
/// document whose total is known is done, the layer becomes `ready`.
pub fn save_ocr_page(conn: &Connection, s: &SaveOcrPage) -> Result<TextLayerPage, String> {
    require_document(conn, &s.document_id)?;
    if s.page < 1 {
        return Err("INVALID_REQUEST".to_string());
    }
    let now = now_iso();
    match &s.words {
        Some(words) => {
            validate_ocr_words(words)?;
            let json = serde_json::to_string(words).map_err(|_| "INVALID_OCR_WORDS".to_string())?;
            conn.execute(
                "INSERT INTO reader_ocr_pages (document_id, page, words_json, status, error_code, updated_at)
                 VALUES (?1, ?2, ?3, 'ready', NULL, ?4)
                 ON CONFLICT(document_id, page) DO UPDATE SET
                    words_json = excluded.words_json, status = 'ready', error_code = NULL, updated_at = excluded.updated_at",
                params![s.document_id, s.page, json, now],
            )
        }
        None => {
            let code: String = s.error_code.as_deref().unwrap_or("OCR_FAILED").chars().take(60).collect();
            conn.execute(
                "INSERT INTO reader_ocr_pages (document_id, page, words_json, status, error_code, updated_at)
                 VALUES (?1, ?2, NULL, 'failed', ?3, ?4)
                 ON CONFLICT(document_id, page) DO UPDATE SET
                    words_json = NULL, status = 'failed', error_code = excluded.error_code, updated_at = excluded.updated_at",
                params![s.document_id, s.page, code, now],
            )
        }
    }
    .map_err(db_err("TEXT_LAYER_SAVE_FAILED"))?;

    let done = ready_count(conn, &s.document_id)?;
    conn.execute(
        "UPDATE reader_documents SET text_layer_pages_done = ?2,
            text_layer_status = CASE WHEN text_layer_pages_total IS NOT NULL AND ?2 >= text_layer_pages_total
                                     THEN 'ready' ELSE text_layer_status END,
            updated_at = ?3
         WHERE id = ?1",
        params![s.document_id, done, now],
    )
    .map_err(db_err("TEXT_LAYER_SAVE_FAILED"))?;
    layer_state(conn, &s.document_id)
}

#[derive(Debug, Deserialize)]
pub struct SetTextLayerState {
    pub document_id: String,
    pub status: String,
    pub pages_total: Option<i64>,
    pub error_code: Option<String>,
}

/// The local extractor reports its progress: it started (`running`, with the page total),
/// finished, or failed.
pub fn set_text_layer_state(conn: &Connection, s: &SetTextLayerState) -> Result<TextLayerPage, String> {
    if !TEXT_LAYER_STATUSES.contains(&s.status.as_str()) {
        return Err("INVALID_REQUEST".to_string());
    }
    require_document(conn, &s.document_id)?;
    let total = s.pages_total.filter(|t| *t >= 0);
    let error: Option<String> = if s.status == "failed" {
        Some(s.error_code.as_deref().unwrap_or("OCR_FAILED").chars().take(60).collect())
    } else {
        None
    };
    conn.execute(
        "UPDATE reader_documents SET text_layer_status = ?2,
            text_layer_pages_total = COALESCE(?3, text_layer_pages_total),
            text_layer_error = ?4, updated_at = ?5
         WHERE id = ?1",
        params![s.document_id, s.status, total, error, now_iso()],
    )
    .map_err(db_err("TEXT_LAYER_SAVE_FAILED"))?;
    layer_state(conn, &s.document_id)
}

#[derive(Debug, Serialize, PartialEq)]
pub struct OcrSummary {
    pub state: TextLayerPage,
    pub ready_pages: Vec<i64>,
    pub failed_pages: Vec<i64>,
}

/// Which pages have words and which failed — what the viewer needs to know which scanned
/// pages are tappable, without pulling every page's words.
pub fn ocr_summary(conn: &Connection, document_id: &str) -> Result<OcrSummary, String> {
    let state = layer_state(conn, document_id)?;
    let mut stmt = conn
        .prepare("SELECT page, status FROM reader_ocr_pages WHERE document_id = ?1 ORDER BY page")
        .map_err(db_err("TEXT_LAYER_FETCH_FAILED"))?;
    let rows = stmt
        .query_map(params![document_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        .map_err(db_err("TEXT_LAYER_FETCH_FAILED"))?;
    let (mut ready_pages, mut failed_pages) = (Vec::new(), Vec::new());
    for (p, st) in rows {
        if st == "ready" {
            ready_pages.push(p);
        } else {
            failed_pages.push(p);
        }
    }
    Ok(OcrSummary { state, ready_pages, failed_pages })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::run_migrations;
    use serde_json::json;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    fn doc(conn: &Connection, id: &str, size: i64) -> ReaderDocument {
        insert_document(
            conn,
            &NewDocument {
                id,
                file_name: Some("My_Book-One.pdf"),
                title: None,
                kind: "pdf",
                stored_file: &format!("{id}.pdf"),
                size_bytes: size,
                language: Some("FR"),
            },
        )
        .unwrap()
    }

    #[test]
    fn a_new_document_has_the_cloud_shape() {
        let c = db();
        let d = doc(&c, "d1", 500);
        assert_eq!(d.title, "My Book One");
        assert_eq!(d.original_filename, "My_Book-One.pdf");
        assert_eq!(d.source_kind, "pdf");
        assert_eq!(d.byte_size, 500);
        assert_eq!(d.language, "fr");
        assert_eq!((d.status.as_str(), d.keep_original, d.last_page), ("ready", true, 1));
        assert!(d.page_count.is_none() && d.last_read_at.is_none() && d.finished_at.is_none());
        let v = serde_json::to_value(&d).unwrap();
        for k in [
            "id", "title", "original_filename", "source_kind", "byte_size", "page_count", "word_count", "language",
            "extraction_method", "status", "error_code", "last_page", "last_scroll_pct", "last_read_at", "created_at",
            "keep_original", "book_edition", "text_layer_status", "text_layer_pages_done", "text_layer_pages_total",
        ] {
            assert!(v.get(k).is_some(), "missing {k}");
        }
        assert!(insert_document(
            &c,
            &NewDocument { id: "x", file_name: None, title: None, kind: "video", stored_file: "x", size_bytes: 1, language: None }
        )
        .is_err());
    }

    #[test]
    fn list_is_newest_first_and_duplicates_match_by_size() {
        let c = db();
        doc(&c, "a", 100);
        doc(&c, "b", 200);
        doc(&c, "c", 100);
        let l = list_documents(&c).unwrap();
        assert_eq!(l.total, 3);
        assert_eq!(l.items[0].id, "c");
        let dup = find_by_size(&c, 100).unwrap();
        assert_eq!(dup.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(), vec!["c", "a"]);
        assert!(find_by_size(&c, 999).unwrap().is_empty());
    }

    #[test]
    fn rename_trims_caps_and_rejects_blank() {
        let c = db();
        doc(&c, "a", 1);
        assert_eq!(rename(&c, "a", "  New  ").unwrap().title, "New");
        assert_eq!(rename(&c, "a", &"x".repeat(300)).unwrap().title.chars().count(), 200);
        assert_eq!(rename(&c, "a", "   ").unwrap_err(), "INVALID_REQUEST");
        assert_eq!(rename(&c, "zzz", "T").unwrap_err(), "DOCUMENT_NOT_FOUND");
    }

    #[test]
    fn position_clamps_to_the_page_count_and_tracks_finished() {
        let c = db();
        doc(&c, "a", 1);
        // Page count unknown: no upper clamp.
        assert_eq!(set_position(&c, "a", Some(40.0), Some(12.4), None).unwrap().last_page, 40);
        set_page_count(&c, "a", 10).unwrap();
        assert_eq!(set_position(&c, "a", Some(40.0), Some(250.0), None).unwrap().last_page, 10);
        assert_eq!(set_position(&c, "a", Some(-5.0), None, None).unwrap().last_page, 1);
        let d = get_document(&c, "a").unwrap();
        assert_eq!(d.last_scroll_pct, 0);
        assert!(d.last_read_at.is_some() && d.finished_at.is_none());

        set_position(&c, "a", Some(10.0), None, Some(true)).unwrap();
        assert!(get_document(&c, "a").unwrap().finished_at.is_some());
        set_position(&c, "a", Some(9.0), None, None).unwrap();
        assert!(get_document(&c, "a").unwrap().finished_at.is_some(), "None leaves finished untouched");
        set_position(&c, "a", Some(3.0), None, Some(false)).unwrap();
        assert!(get_document(&c, "a").unwrap().finished_at.is_none());
        assert_eq!(set_position(&c, "nope", Some(1.0), None, None).unwrap_err(), "DOCUMENT_NOT_FOUND");
    }

    #[test]
    fn language_edition_and_page_count_validate() {
        let c = db();
        doc(&c, "a", 1);
        assert_eq!(set_language(&c, "a", "DE").unwrap().language, "de");
        assert_eq!(set_language(&c, "a", "not a language").unwrap_err(), "INVALID_REQUEST");
        assert_eq!(set_edition(&c, "a", Some("  edito-a1-2e ")).unwrap().book_edition.as_deref(), Some("edito-a1-2e"));
        assert_eq!(set_edition(&c, "a", Some("   ")).unwrap().book_edition, None);
        assert_eq!(get_document(&c, "a").unwrap().book_edition, None);
        assert_eq!(
            set_edition(&c, "a", Some(&"e".repeat(100))).unwrap().book_edition.unwrap().chars().count(),
            60
        );
        assert_eq!(set_edition(&c, "zz", None).unwrap_err(), "DOCUMENT_NOT_FOUND");
        assert_eq!(set_page_count(&c, "a", 0).unwrap_err(), "INVALID_REQUEST");
        set_page_count(&c, "a", 88).unwrap();
        assert_eq!(get_document(&c, "a").unwrap().page_count, Some(88));
    }

    #[test]
    fn sessions_resume_inside_ninety_minutes_and_restart_after() {
        let c = db();
        doc(&c, "a", 1);
        let t0 = Utc::now();
        let s1 = start_session(&c, "a", Some(3.0), Some(120.0), t0).unwrap();
        assert!(!s1.resumed);
        assert_eq!(get_document(&c, "a").unwrap().page_count, Some(120), "page count learned from the viewer");

        let s2 = start_session(&c, "a", Some(5.0), Some(999.0), t0 + Duration::minutes(89)).unwrap();
        assert_eq!(s2, SessionStart { session_id: s1.session_id.clone(), resumed: true });
        assert_eq!(get_document(&c, "a").unwrap().page_count, Some(120), "known page count is not overwritten");
        let end: i64 = c
            .query_row("SELECT end_page FROM reader_sessions WHERE id = ?1", params![s1.session_id], |r| r.get(0))
            .unwrap();
        assert_eq!(end, 5);

        // 89 minutes after the resume (last_seen moved), still resumed; 91 after that, not.
        let s3 = start_session(&c, "a", Some(6.0), None, t0 + Duration::minutes(89 + 91)).unwrap();
        assert!(!s3.resumed);
        assert_ne!(s3.session_id, s1.session_id);
        assert_eq!(start_session(&c, "gone", None, None, t0).unwrap_err(), "DOCUMENT_NOT_FOUND");
    }

    #[test]
    fn words_are_logged_validated_and_aggregated() {
        let c = db();
        doc(&c, "a", 1);
        doc(&c, "b", 2);
        let s = start_session(&c, "a", Some(1.0), None, Utc::now()).unwrap();
        let other = start_session(&c, "b", Some(1.0), None, Utc::now()).unwrap();

        log_word(&c, "a", Some(&s.session_id), " Chat ", Some("  le chat dort  "), Some(2.0)).unwrap();
        log_word(&c, "a", Some(&s.session_id), "chat", Some("un chat"), Some(4.0)).unwrap();
        log_word(&c, "a", None, "chien", None, Some(4.0)).unwrap();
        // Another document's session is dropped, not trusted.
        log_word(&c, "a", Some(&other.session_id), "maison", None, None).unwrap();

        assert_eq!(log_word(&c, "a", None, "   ", None, None).unwrap_err(), "INVALID_REQUEST");
        assert_eq!(log_word(&c, "nope", None, "x", None, None).unwrap_err(), "DOCUMENT_NOT_FOUND");
        log_word(&c, "a", None, &"w".repeat(500), Some(&"c".repeat(900)), None).unwrap();

        let all = words(&c, "a", None).unwrap();
        assert_eq!(all.total_events, 5);
        let chat = all.items.iter().find(|w| w.key == "chat").unwrap();
        assert_eq!((chat.count, chat.word.as_str()), (2, "chat"));
        assert_eq!(chat.pages, vec![4, 2]);
        assert_eq!(chat.context.as_deref(), Some("un chat"));
        assert_eq!(all.items[0].key, "chat", "highest count first");
        let long = all.items.iter().find(|w| w.key.starts_with("ww")).unwrap();
        assert_eq!(long.word.chars().count(), 120);
        assert_eq!(long.context.as_deref().unwrap().chars().count(), 400);

        let one = words(&c, "a", Some(&s.session_id)).unwrap();
        assert_eq!(one.total_events, 2);
        let wc: i64 = c
            .query_row("SELECT word_count FROM reader_sessions WHERE id = ?1", params![s.session_id], |r| r.get(0))
            .unwrap();
        assert_eq!(wc, 2);
        assert_eq!(words(&c, "nope", None).unwrap_err(), "DOCUMENT_NOT_FOUND");
    }

    #[test]
    fn notes_round_trip_with_clamped_rects() {
        let c = db();
        doc(&c, "a", 1);
        let saved = save_note(
            &c,
            &SaveNote {
                id: None,
                document_id: "a".into(),
                page: Some(0.0),
                quote: Some("q".repeat(3000)),
                body: Some("hello".into()),
                run_start: Some(2),
                run_end: Some(5),
                rect: Some(Rect { x: Some(-4.0), y: Some(50.5), w: Some(400.0), h: None }),
            },
        )
        .unwrap();
        let list = list_notes(&c, "a").unwrap().items;
        assert_eq!(list.len(), 1);
        let n = &list[0];
        assert_eq!((n.id.as_str(), n.page_number, n.quote.chars().count()), (saved.id.as_str(), 1, 2000));
        assert_eq!((n.rect_x, n.rect_y, n.rect_w, n.rect_h), (0.0, 50.5, 100.0, 0.0));
        assert_eq!((n.run_start, n.run_end), (Some(2), Some(5)));

        let upd = save_note(
            &c,
            &SaveNote {
                id: Some(saved.id.clone()),
                document_id: "a".into(),
                page: Some(3.0),
                quote: None,
                body: Some("edited".into()),
                run_start: None,
                run_end: None,
                rect: None,
            },
        )
        .unwrap();
        assert_eq!(upd.id, saved.id);
        let n = &list_notes(&c, "a").unwrap().items[0];
        assert_eq!((n.body.as_str(), n.page_number), ("edited", 3));

        let missing = SaveNote { id: Some("ghost".into()), document_id: "a".into(), page: None, quote: None, body: None, run_start: None, run_end: None, rect: None };
        assert_eq!(save_note(&c, &missing).unwrap_err(), "NOTE_SAVE_FAILED");
        let nodoc = SaveNote { id: None, document_id: "zz".into(), page: None, quote: None, body: None, run_start: None, run_end: None, rect: None };
        assert_eq!(save_note(&c, &nodoc).unwrap_err(), "DOCUMENT_NOT_FOUND");

        delete_note(&c, &saved.id).unwrap();
        assert!(list_notes(&c, "a").unwrap().items.is_empty());
        assert!(delete_note(&c, "ghost").unwrap().ok, "deleting a missing note is not an error");
    }

    #[test]
    fn text_boxes_clamp_and_sanitise_ink() {
        let c = db();
        doc(&c, "a", 1);
        let id = save_text_box(
            &c,
            &SaveTextBox {
                id: None,
                document_id: "a".into(),
                page: Some(2.0),
                body: Some("answer".into()),
                x: Some(150.0),
                y: Some(-1.0),
                w: Some(0.0),
                font_size: Some(99.0),
                color: Some("javascript:alert(1)".into()),
                bold: Some(true),
                background: None,
            },
        )
        .unwrap()
        .id;
        let t = &list_text_boxes(&c, "a").unwrap().items[0];
        assert_eq!((t.x, t.y, t.w, t.font_size), (100.0, 0.0, 1.0, 10.0));
        assert_eq!((t.color.as_str(), t.bold, t.background, t.page_number), ("terra", true, false, 2));

        save_text_box(
            &c,
            &SaveTextBox {
                id: Some(id.clone()),
                document_id: "a".into(),
                page: Some(2.0),
                body: Some("b".repeat(5000)),
                x: Some(10.0),
                y: Some(10.0),
                w: Some(30.0),
                font_size: None,
                color: Some("#A1b2C3".into()),
                bold: None,
                background: Some(true),
            },
        )
        .unwrap();
        let t = &list_text_boxes(&c, "a").unwrap().items[0];
        assert_eq!((t.body.chars().count(), t.font_size, t.color.as_str(), t.bold, t.background), (2000, 1.6, "#A1b2C3", false, true));
        delete_text_box(&c, &id).unwrap();
        assert!(list_text_boxes(&c, "a").unwrap().items.is_empty());
    }

    #[test]
    fn marks_validate_kind_and_stay_in_range() {
        let c = db();
        doc(&c, "a", 1);
        let mk = |kind: Option<&str>| SaveMark {
            id: None,
            document_id: "a".into(),
            page: Some(1.0),
            kind: kind.map(String::from),
            x1: Some(10.0),
            y1: Some(20.0),
            x2: Some(500.0),
            y2: None,
            size: Some(0.0),
            color: Some("danger".into()),
        };
        assert_eq!(save_mark(&c, &mk(Some("sparkle"))).unwrap_err(), "INVALID_REQUEST");
        assert_eq!(save_mark(&c, &mk(None)).unwrap_err(), "INVALID_REQUEST");
        let id = save_mark(&c, &mk(Some("highlight"))).unwrap().id;
        let m = &list_marks(&c, "a").unwrap().items[0];
        assert_eq!((m.kind.as_str(), m.x2, m.y2, m.size, m.color.as_str()), ("highlight", 100.0, 0.0, 0.3, "danger"));

        let mut upd = mk(Some("arrow"));
        upd.id = Some(id.clone());
        save_mark(&c, &upd).unwrap();
        assert_eq!(list_marks(&c, "a").unwrap().items[0].kind, "arrow");
        delete_mark(&c, &id).unwrap();
        assert!(list_marks(&c, "a").unwrap().items.is_empty());
    }

    fn words_json() -> Value {
        json!({"v":1,"lines":[[0.1,0.1,0.5,0.2]],"words":[["Bonjour",0.1,0.1,0.3,0.2,0]]})
    }

    #[test]
    fn ocr_pages_save_read_and_complete_the_layer() {
        let c = db();
        doc(&c, "a", 1);
        let s = get_ocr_page(&c, "a", None).unwrap();
        assert_eq!((s.status, s.pages_done, s.pages_total), (None, 0, None));

        set_text_layer_state(
            &c,
            &SetTextLayerState { document_id: "a".into(), status: "running".into(), pages_total: Some(2), error_code: None },
        )
        .unwrap();

        let after_one = save_ocr_page(&c, &SaveOcrPage { document_id: "a".into(), page: 1, words: Some(words_json()), error_code: None }).unwrap();
        assert_eq!((after_one.status.as_deref(), after_one.pages_done, after_one.pages_total), (Some("running"), 1, Some(2)));

        let p1 = get_ocr_page(&c, "a", Some(1)).unwrap();
        assert_eq!(p1.page, Some(1));
        assert_eq!(p1.words, Some(words_json()));
        assert_eq!(get_ocr_page(&c, "a", Some(2)).unwrap().words, None);

        save_ocr_page(&c, &SaveOcrPage { document_id: "a".into(), page: 2, words: None, error_code: Some("OCR_PAGE_FAILED".into()) }).unwrap();
        let sum = ocr_summary(&c, "a").unwrap();
        assert_eq!((sum.ready_pages, sum.failed_pages), (vec![1], vec![2]));
        assert_eq!(sum.state.status.as_deref(), Some("running"), "a failed page does not finish the layer");

        let done = save_ocr_page(&c, &SaveOcrPage { document_id: "a".into(), page: 2, words: Some(words_json()), error_code: None }).unwrap();
        assert_eq!((done.status.as_deref(), done.pages_done), (Some("ready"), 2));
        assert_eq!(get_document(&c, "a").unwrap().text_layer_pages_done, Some(2));
    }

    #[test]
    fn ocr_input_is_validated() {
        let c = db();
        doc(&c, "a", 1);
        let bad = json!({"v":1,"lines":[],"words":[["x",0,0,5,1,0]]});
        assert_eq!(
            save_ocr_page(&c, &SaveOcrPage { document_id: "a".into(), page: 1, words: Some(bad), error_code: None }).unwrap_err(),
            "INVALID_OCR_WORDS"
        );
        assert_eq!(
            save_ocr_page(&c, &SaveOcrPage { document_id: "a".into(), page: 0, words: Some(words_json()), error_code: None }).unwrap_err(),
            "INVALID_REQUEST"
        );
        assert_eq!(
            save_ocr_page(&c, &SaveOcrPage { document_id: "nope".into(), page: 1, words: Some(words_json()), error_code: None }).unwrap_err(),
            "DOCUMENT_NOT_FOUND"
        );
        let st = |s: &str| SetTextLayerState { document_id: "a".into(), status: s.into(), pages_total: None, error_code: Some("X".into()) };
        assert_eq!(set_text_layer_state(&c, &st("done")).unwrap_err(), "INVALID_REQUEST");
        let failed = set_text_layer_state(&c, &st("failed")).unwrap();
        assert_eq!((failed.status.as_deref(), failed.error_code.as_deref()), (Some("failed"), Some("X")));
        let retried = set_text_layer_state(&c, &st("pending")).unwrap();
        assert_eq!(retried.error_code, None, "error clears when the layer is retried");
    }

    #[test]
    fn deleting_a_document_removes_everything_and_reports_missing() {
        let c = db();
        doc(&c, "a", 1);
        assert_eq!(stored_file(&c, "a").unwrap(), "a.pdf");
        save_mark(&c, &SaveMark { id: None, document_id: "a".into(), page: None, kind: Some("box".into()), x1: None, y1: None, x2: None, y2: None, size: None, color: None }).unwrap();
        log_word(&c, "a", None, "hi", None, None).unwrap();
        save_ocr_page(&c, &SaveOcrPage { document_id: "a".into(), page: 1, words: Some(words_json()), error_code: None }).unwrap();
        delete_rows(&c, "a").unwrap();
        for t in ["reader_marks", "reader_word_log", "reader_ocr_pages", "reader_documents"] {
            let n: i64 = c.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0)).unwrap();
            assert_eq!(n, 0, "{t}");
        }
        assert_eq!(delete_rows(&c, "a").unwrap_err(), "DOCUMENT_NOT_FOUND");
        assert_eq!(stored_file(&c, "a").unwrap_err(), "DOCUMENT_NOT_FOUND");
    }

    #[test]
    fn a_text_document_keeps_its_pages_and_serves_them_clamped() {
        let c = db();
        let pages = vec!["First page about Toronto.".to_string(), "Second page about Vancouver.".to_string()];
        let d = insert_text_document(
            &c,
            &NewTextDocument { id: "t1", title: "  Two cities ", source_name: "pasted-text.txt", language: "en", pages: &pages },
        )
        .unwrap();
        assert_eq!((d.source_kind.as_str(), d.page_count, d.word_count), ("text", Some(2), Some(8)));
        assert_eq!((d.title.as_str(), d.extraction_method.as_deref()), ("Two cities", Some("text")));

        let p1 = get_text_page(&c, "t1", Some(1.0)).unwrap();
        assert_eq!((p1.page_number, p1.page_count, p1.has_prev, p1.has_next), (1, 2, false, true));
        assert_eq!(p1.content, "First page about Toronto.");
        let beyond = get_text_page(&c, "t1", Some(99.0)).unwrap();
        assert_eq!((beyond.page_number, beyond.has_next), (2, false));
        assert_eq!(get_text_page(&c, "t1", None).unwrap().page_number, 1);

        // Listed with the other documents; never offered as a duplicate of a same-size PDF.
        assert_eq!(list_documents(&c).unwrap().total, 1);
        assert!(find_by_size(&c, d.byte_size).unwrap().is_empty());

        // Deleting it takes the pages along.
        delete_rows(&c, "t1").unwrap();
        let left: i64 = c.query_row("SELECT COUNT(*) FROM reader_text_pages", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn text_documents_reject_empty_input_and_pdfs_have_no_text_pages() {
        let c = db();
        let none: Vec<String> = vec![];
        assert_eq!(
            insert_text_document(&c, &NewTextDocument { id: "e", title: "x", source_name: "x.txt", language: "en", pages: &none }).unwrap_err(),
            "EMPTY_TEXT"
        );
        doc(&c, "p", 10);
        assert_eq!(get_text_page(&c, "p", Some(1.0)).unwrap_err(), "DOCUMENT_NOT_FOUND");
        assert_eq!(get_text_page(&c, "missing", Some(1.0)).unwrap_err(), "DOCUMENT_NOT_FOUND");
    }
}
