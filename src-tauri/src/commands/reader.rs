//! Reader commands. Thin wrappers over `crate::reader::store` (SQLite) and
//! `crate::reader::files` (the `$APPDATA/reader/` directory). Argument names follow the
//! website's `readerApi.ts` bodies (snake_case, passed as one `input` object); the
//! responses have the same JSON shape as `reader?action=...`.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

use crate::reader::files;
use crate::reader::store::{self, *};
use crate::reader::{decode_header, looks_like_pdf, normalise_language, text};
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

// ── Import ───────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct InspectedPath {
    pub file_name: String,
    pub byte_size: i64,
    /// Documents already in the library with exactly this size.
    pub duplicates: Vec<ReaderDocument>,
}

/// Size and duplicate check for a file the user chose, before importing it.
#[tauri::command]
pub fn reader_inspect_path(state: State<'_, AppState>, path: String) -> Result<InspectedPath, String> {
    let p = std::path::Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|_| "FILE_NOT_FOUND".to_string())?;
    if !meta.is_file() || meta.len() == 0 {
        return Err("EMPTY_FILE".to_string());
    }
    let conn = lock_db(&state)?;
    let size = meta.len() as i64;
    Ok(InspectedPath {
        file_name: p.file_name().and_then(|n| n.to_str()).unwrap_or("document.pdf").to_string(),
        byte_size: size,
        duplicates: find_by_size(&conn, size)?,
    })
}

#[tauri::command]
pub fn reader_check_duplicate(state: State<'_, AppState>, byte_size: i64) -> Result<Vec<ReaderDocument>, String> {
    let conn = lock_db(&state)?;
    find_by_size(&conn, byte_size)
}

#[derive(Deserialize)]
pub struct ImportPath {
    pub path: String,
    pub language: Option<String>,
    pub title: Option<String>,
}

/// Copy a PDF the user chose into `$APPDATA/reader/<uuid>.pdf` and register it.
#[tauri::command]
pub async fn reader_import_path(state: State<'_, AppState>, input: ImportPath) -> Result<ReaderDocument, String> {
    let dir = files::default_reader_dir()?;
    let id = uuid::Uuid::new_v4().to_string();
    let src = std::path::PathBuf::from(&input.path);
    let file_name = src.file_name().and_then(|n| n.to_str()).map(String::from);

    let (id2, dir2) = (id.clone(), dir.clone());
    let (stored, size) = tokio::task::spawn_blocking(move || files::import_path(&dir2, &src, &id2))
        .await
        .map_err(|_| "FILE_WRITE_FAILED".to_string())??;

    let inserted = {
        let conn = lock_db(&state)?;
        insert_document(
            &conn,
            &NewDocument {
                id: &id,
                file_name: file_name.as_deref(),
                title: input.title.as_deref(),
                kind: "pdf",
                stored_file: &stored,
                size_bytes: size as i64,
                language: input.language.as_deref(),
            },
        )
    };
    if inserted.is_err() {
        let _ = files::remove(&dir, &stored);
    }
    inserted
}

fn header(req: &Request<'_>, name: &str) -> Option<String> {
    req.headers().get(name).and_then(|v| v.to_str().ok()).map(decode_header)
}

/// Import PDF bytes sent as the raw IPC body (a photo the front already converted to PDF).
/// Headers: `x-file-name` (percent-encoded), `x-kind` (`pdf` | `image`, default `pdf`),
/// `x-language`, `x-title` (percent-encoded). Raw bytes avoid the JSON-array blow-up of
/// `Vec<u8>` for large scans.
#[tauri::command]
pub async fn reader_import_bytes(state: State<'_, AppState>, request: Request<'_>) -> Result<ReaderDocument, String> {
    let bytes = match request.body() {
        InvokeBody::Raw(b) => b.clone(),
        _ => return Err("INVALID_REQUEST".to_string()),
    };
    let file_name = header(&request, "x-file-name");
    let title = header(&request, "x-title");
    let language = header(&request, "x-language");
    let kind = header(&request, "x-kind").unwrap_or_else(|| "pdf".to_string());
    if kind != "pdf" && kind != "image" {
        return Err("INVALID_REQUEST".to_string());
    }
    if !looks_like_pdf(&bytes[..bytes.len().min(1024)]) {
        return Err("NOT_A_PDF".to_string());
    }

    let dir = files::default_reader_dir()?;
    let id = uuid::Uuid::new_v4().to_string();
    let (id2, dir2) = (id.clone(), dir.clone());
    let (stored, size) = tokio::task::spawn_blocking(move || files::import_bytes(&dir2, &bytes, &id2))
        .await
        .map_err(|_| "FILE_WRITE_FAILED".to_string())??;

    let inserted = {
        let conn = lock_db(&state)?;
        insert_document(
            &conn,
            &NewDocument {
                id: &id,
                file_name: file_name.as_deref(),
                title: title.as_deref(),
                kind: &kind,
                stored_file: &stored,
                size_bytes: size as i64,
                language: language.as_deref(),
            },
        )
    };
    if inserted.is_err() {
        let _ = files::remove(&dir, &stored);
    }
    inserted
}

// ── Text documents: pasted text and web pages ────────────────────────────────

#[derive(Deserialize)]
pub struct ImportText {
    pub text: String,
    pub title: Option<String>,
    pub language: Option<String>,
}

/// Store a text (the pages it splits into) as a document of kind `text`.
fn store_text(
    state: &State<'_, AppState>,
    text: &str,
    title: Option<&str>,
    source_name: &str,
    language: Option<&str>,
) -> Result<ReaderDocument, String> {
    let text = text::normalise_text(text);
    if text.trim().is_empty() {
        return Err("EMPTY_TEXT".to_string());
    }
    if text.chars().count() > text::MAX_TEXT_CHARS {
        return Err("TEXT_TOO_LONG".to_string());
    }
    let pages = text::split_pages(&text);
    if pages.is_empty() {
        return Err("EMPTY_TEXT".to_string());
    }
    let language = normalise_language(language, "en");
    let derived;
    let title = match title.map(str::trim).filter(|t| !t.is_empty()) {
        Some(t) => t,
        None => {
            derived = text::title_from_text(&text);
            &derived
        }
    };
    let id = uuid::Uuid::new_v4().to_string();
    let conn = lock_db(state)?;
    insert_text_document(
        &conn,
        &NewTextDocument { id: &id, title, source_name, language: &language, pages: &pages },
    )
}

#[tauri::command]
pub fn reader_import_text(state: State<'_, AppState>, input: ImportText) -> Result<ReaderDocument, String> {
    store_text(&state, &input.text, input.title.as_deref(), "pasted-text.txt", input.language.as_deref())
}

#[derive(Deserialize)]
pub struct ImportUrl {
    pub url: String,
    pub title: Option<String>,
    pub language: Option<String>,
}

/// Pages bigger than this are refused before they are read into memory.
const MAX_PAGE_BYTES: u64 = 5 * 1024 * 1024;

async fn fetch_page(url: &reqwest::Url) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("Mozilla/5.0 (compatible; FlexiLingo Desk)")
        .build()
        .map_err(|_| "URL_FETCH_FAILED".to_string())?;
    let resp = client.get(url.clone()).send().await.map_err(|_| "URL_FETCH_FAILED".to_string())?;
    if !resp.status().is_success() {
        return Err("URL_FETCH_FAILED".to_string());
    }
    let kind = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    if !kind.is_empty() && !kind.contains("html") && !kind.starts_with("text/") {
        return Err("URL_NOT_TEXT".to_string());
    }
    if resp.content_length().map_or(false, |n| n > MAX_PAGE_BYTES) {
        return Err("URL_TOO_LARGE".to_string());
    }
    let plain = kind.starts_with("text/plain");
    let body = resp.text_with_charset("utf-8").await.map_err(|_| "URL_FETCH_FAILED".to_string())?;
    if body.len() as u64 > MAX_PAGE_BYTES {
        return Err("URL_TOO_LARGE".to_string());
    }
    // A plain-text address is already the text: wrap it so the extractor keeps its lines.
    Ok(if plain { format!("<body><pre>{}</pre></body>", body.replace('&', "&amp;").replace('<', "&lt;")) } else { body })
}

/// Fetch a web page, keep its prose, and store it as a text document.
#[tauri::command]
pub async fn reader_import_url(state: State<'_, AppState>, input: ImportUrl) -> Result<ReaderDocument, String> {
    let raw = input.url.trim();
    let candidate = if raw.contains("://") { raw.to_string() } else { format!("https://{raw}") };
    let url = reqwest::Url::parse(&candidate).map_err(|_| "INVALID_URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("INVALID_URL".to_string());
    }
    let html = fetch_page(&url).await?;
    let article = text::extract_article(&html);
    if article.text.chars().count() < 40 {
        return Err("URL_NO_TEXT".to_string());
    }
    let language = input.language.as_deref().filter(|l| !l.trim().is_empty()).or(article.language.as_deref());
    let title = input.title.as_deref().filter(|t| !t.trim().is_empty()).or(article.title.as_deref());
    let host = url.host_str().unwrap_or("page").trim_start_matches("www.").to_string();
    store_text(&state, &article.text, title, &host, language)
}

#[derive(Deserialize)]
pub struct TextPageInput {
    pub document_id: String,
    pub page: Option<f64>,
}

#[tauri::command]
pub fn reader_text_page(state: State<'_, AppState>, input: TextPageInput) -> Result<ReaderTextPage, String> {
    get_text_page(&*lock_db(&state)?, &input.document_id, input.page)
}

// ── Documents ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn reader_list(state: State<'_, AppState>) -> Result<DocumentList, String> {
    list_documents(&*lock_db(&state)?)
}

#[tauri::command]
pub fn reader_get(state: State<'_, AppState>, document_id: String) -> Result<ReaderDocument, String> {
    get_document(&*lock_db(&state)?, &document_id)
}

#[derive(Deserialize)]
pub struct RenameInput {
    pub document_id: String,
    pub title: String,
}

#[tauri::command]
pub fn reader_rename(state: State<'_, AppState>, input: RenameInput) -> Result<RenameResult, String> {
    rename(&*lock_db(&state)?, &input.document_id, &input.title)
}

/// Delete the file first, then the rows (a row deleted before its file strands the file).
#[tauri::command]
pub fn reader_delete(state: State<'_, AppState>, document_id: String) -> Result<OkResult, String> {
    let conn = lock_db(&state)?;
    let stored = store::stored_file(&conn, &document_id)?;
    // A text document has no file: its pages live in the database and go with the rows.
    if !stored.is_empty() {
        files::remove(&files::default_reader_dir()?, &stored)?;
    }
    delete_rows(&conn, &document_id)?;
    Ok(OkResult { ok: true })
}

#[derive(Deserialize)]
pub struct PositionInput {
    pub document_id: String,
    pub page: Option<f64>,
    pub scroll_pct: Option<f64>,
    pub finished: Option<bool>,
}

#[tauri::command]
pub fn reader_set_position(state: State<'_, AppState>, input: PositionInput) -> Result<PositionResult, String> {
    set_position(&*lock_db(&state)?, &input.document_id, input.page, input.scroll_pct, input.finished)
}

#[derive(Deserialize)]
pub struct LanguageInput {
    pub document_id: String,
    pub language: String,
}

#[tauri::command]
pub fn reader_set_language(state: State<'_, AppState>, input: LanguageInput) -> Result<LanguageResult, String> {
    set_language(&*lock_db(&state)?, &input.document_id, &input.language)
}

#[derive(Deserialize)]
pub struct EditionInput {
    pub document_id: String,
    pub edition: Option<String>,
}

#[tauri::command]
pub fn reader_set_edition(state: State<'_, AppState>, input: EditionInput) -> Result<EditionResult, String> {
    set_edition(&*lock_db(&state)?, &input.document_id, input.edition.as_deref())
}

#[derive(Deserialize)]
pub struct PageCountInput {
    pub document_id: String,
    pub page_count: i64,
}

#[tauri::command]
pub fn reader_set_page_count(state: State<'_, AppState>, input: PageCountInput) -> Result<OkResult, String> {
    set_page_count(&*lock_db(&state)?, &input.document_id, input.page_count)?;
    Ok(OkResult { ok: true })
}

/// Absolute path of the stored file, for `convertFileSrc` (asset protocol, scope
/// `$APPDATA/reader/**`). Fails if the file has gone missing from disk.
#[tauri::command]
pub fn reader_file_path(state: State<'_, AppState>, document_id: String) -> Result<String, String> {
    let stored = store::stored_file(&*lock_db(&state)?, &document_id)?;
    let path = files::resolve(&files::default_reader_dir()?, &stored)?;
    if !path.is_file() {
        return Err("FILE_MISSING".to_string());
    }
    path.to_str().map(String::from).ok_or_else(|| "INVALID_FILE_PATH".to_string())
}

// ── Sessions and words ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct StartSessionInput {
    pub document_id: String,
    pub page: Option<f64>,
    pub page_count: Option<f64>,
}

#[tauri::command]
pub fn reader_start_session(state: State<'_, AppState>, input: StartSessionInput) -> Result<SessionStart, String> {
    start_session(&*lock_db(&state)?, &input.document_id, input.page, input.page_count, Utc::now())
}

#[derive(Deserialize)]
pub struct LogWordInput {
    pub document_id: String,
    pub session_id: Option<String>,
    pub word: String,
    pub context: Option<String>,
    pub page: Option<f64>,
}

#[tauri::command]
pub fn reader_log_word(state: State<'_, AppState>, input: LogWordInput) -> Result<OkResult, String> {
    log_word(
        &*lock_db(&state)?,
        &input.document_id,
        input.session_id.as_deref(),
        &input.word,
        input.context.as_deref(),
        input.page,
    )?;
    Ok(OkResult { ok: true })
}

#[derive(Deserialize)]
pub struct WordsInput {
    pub document_id: String,
    pub session_id: Option<String>,
}

#[tauri::command]
pub fn reader_words(state: State<'_, AppState>, input: WordsInput) -> Result<WordsResult, String> {
    words(&*lock_db(&state)?, &input.document_id, input.session_id.as_deref())
}

// ── Notes / text boxes / marks ───────────────────────────────────────────────

#[derive(Deserialize)]
pub struct IdInput {
    pub id: String,
}

#[tauri::command]
pub fn reader_notes(state: State<'_, AppState>, document_id: String) -> Result<Items<ReaderNote>, String> {
    list_notes(&*lock_db(&state)?, &document_id)
}

#[tauri::command]
pub fn reader_save_note(state: State<'_, AppState>, input: SaveNote) -> Result<Saved, String> {
    save_note(&*lock_db(&state)?, &input)
}

#[tauri::command]
pub fn reader_delete_note(state: State<'_, AppState>, input: IdInput) -> Result<OkResult, String> {
    delete_note(&*lock_db(&state)?, &input.id)
}

#[tauri::command]
pub fn reader_text_boxes(state: State<'_, AppState>, document_id: String) -> Result<Items<ReaderTextBox>, String> {
    list_text_boxes(&*lock_db(&state)?, &document_id)
}

#[tauri::command]
pub fn reader_save_text_box(state: State<'_, AppState>, input: SaveTextBox) -> Result<Saved, String> {
    save_text_box(&*lock_db(&state)?, &input)
}

#[tauri::command]
pub fn reader_delete_text_box(state: State<'_, AppState>, input: IdInput) -> Result<OkResult, String> {
    delete_text_box(&*lock_db(&state)?, &input.id)
}

#[tauri::command]
pub fn reader_marks(state: State<'_, AppState>, document_id: String) -> Result<Items<ReaderMark>, String> {
    list_marks(&*lock_db(&state)?, &document_id)
}

#[tauri::command]
pub fn reader_save_mark(state: State<'_, AppState>, input: SaveMark) -> Result<Saved, String> {
    save_mark(&*lock_db(&state)?, &input)
}

#[tauri::command]
pub fn reader_delete_mark(state: State<'_, AppState>, input: IdInput) -> Result<OkResult, String> {
    delete_mark(&*lock_db(&state)?, &input.id)
}

// ── OCR text layer ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct OcrPageInput {
    pub document_id: String,
    pub page: Option<i64>,
}

/// `reader?action=text-layer`: the layer's state, plus one page's words when `page` is given.
#[tauri::command]
pub fn reader_ocr_page_get(state: State<'_, AppState>, input: OcrPageInput) -> Result<TextLayerPage, String> {
    get_ocr_page(&*lock_db(&state)?, &input.document_id, input.page)
}

#[tauri::command]
pub fn reader_ocr_page_save(state: State<'_, AppState>, input: SaveOcrPage) -> Result<TextLayerPage, String> {
    save_ocr_page(&*lock_db(&state)?, &input)
}

#[tauri::command]
pub fn reader_ocr_summary(state: State<'_, AppState>, document_id: String) -> Result<OcrSummary, String> {
    ocr_summary(&*lock_db(&state)?, &document_id)
}

#[tauri::command]
pub fn reader_set_text_layer_state(
    state: State<'_, AppState>,
    input: SetTextLayerState,
) -> Result<TextLayerPage, String> {
    set_text_layer_state(&*lock_db(&state)?, &input)
}
