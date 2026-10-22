//! The Notes page's local half: every note written on this computer, in one list.
//!
//! Two stores feed it, and they stay separate (each keeps its own commands and its own
//! delete): podcast bookmarks (`podcast_bookmarks`, a label and a note at a second of an
//! episode) and reader notes (`reader_notes`, a note on a page of a document). Tags exist
//! on the website's notes but in neither table, so they live in a small side table keyed
//! by (source, note id) that is created on first use.

use std::collections::HashMap;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::AppState;

const MAX_TAGS: usize = 20;
const MAX_TAG_CHARS: usize = 40;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LocalNote {
    pub id: String,
    /// "podcast" or "reader".
    pub source: String,
    /// The episode id or the document id.
    pub source_id: String,
    pub source_title: Option<String>,
    /// Reader only: "pdf", "image" or "text".
    pub source_kind: Option<String>,
    /// Podcast only.
    pub position_ms: Option<i64>,
    /// Reader only.
    pub page: Option<i64>,
    pub label: Option<String>,
    pub note: Option<String>,
    /// The words the note was written on (reader notes quote the page).
    pub excerpt: Option<String>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NoteRef {
    pub source: String,
    pub id: String,
}

fn lock_db<'a>(state: &'a State<'a, AppState>) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

fn db_err(code: &'static str) -> impl Fn(rusqlite::Error) -> String {
    move |e| format!("{code}: {e}")
}

fn ensure_tags_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS local_note_tags (
            source  TEXT NOT NULL,
            note_id TEXT NOT NULL,
            tags    TEXT NOT NULL DEFAULT '[]',
            PRIMARY KEY (source, note_id)
        );",
    )
    .map_err(db_err("NOTES_TAGS_FAILED"))
}

/// Trimmed, lower-cased, unique, bounded - what the website's tag input does.
pub fn clean_tags(tags: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags {
        let t: String = t.trim().to_lowercase().chars().take(MAX_TAG_CHARS).collect();
        if !t.is_empty() && !out.contains(&t) {
            out.push(t);
        }
        if out.len() >= MAX_TAGS {
            break;
        }
    }
    out
}

fn blank_to_none(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn load_tags(conn: &Connection) -> Result<HashMap<(String, String), Vec<String>>, String> {
    let mut stmt = conn
        .prepare("SELECT source, note_id, tags FROM local_note_tags")
        .map_err(db_err("NOTES_TAGS_FAILED"))?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
        .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        .map_err(db_err("NOTES_TAGS_FAILED"))?;
    Ok(rows
        .into_iter()
        .map(|(s, id, json)| ((s, id), serde_json::from_str::<Vec<String>>(&json).unwrap_or_default()))
        .collect())
}

pub fn list_local_notes(conn: &Connection) -> Result<Vec<LocalNote>, String> {
    ensure_tags_table(conn)?;
    let tags = load_tags(conn)?;
    let mut notes: Vec<LocalNote> = Vec::new();

    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.episode_id, e.title, b.position_ms, b.label, b.note, b.created_at
             FROM podcast_bookmarks b LEFT JOIN podcast_episodes e ON e.id = b.episode_id
             ORDER BY b.created_at DESC LIMIT 5000",
        )
        .map_err(db_err("NOTES_FETCH_FAILED"))?;
    let podcast = stmt
        .query_map([], |r| {
            let created: String = r.get(6)?;
            Ok(LocalNote {
                id: r.get(0)?,
                source: "podcast".into(),
                source_id: r.get(1)?,
                source_title: r.get(2)?,
                source_kind: None,
                position_ms: r.get(3)?,
                page: None,
                label: r.get(4)?,
                note: r.get(5)?,
                excerpt: None,
                tags: Vec::new(),
                updated_at: created.clone(),
                created_at: created,
            })
        })
        .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        .map_err(db_err("NOTES_FETCH_FAILED"))?;
    notes.extend(podcast);

    let mut stmt = conn
        .prepare(
            "SELECT n.id, n.document_id, d.title, d.kind, n.page_number, n.quote, n.body, n.created_at, n.updated_at
             FROM reader_notes n JOIN reader_documents d ON d.id = n.document_id
             ORDER BY n.created_at DESC LIMIT 5000",
        )
        .map_err(db_err("NOTES_FETCH_FAILED"))?;
    let reader = stmt
        .query_map([], |r| {
            let quote: String = r.get(5)?;
            let body: String = r.get(6)?;
            Ok(LocalNote {
                id: r.get(0)?,
                source: "reader".into(),
                source_id: r.get(1)?,
                source_title: r.get(2)?,
                source_kind: r.get(3)?,
                position_ms: None,
                page: r.get(4)?,
                label: None,
                note: Some(body).filter(|b| !b.is_empty()),
                excerpt: Some(quote).filter(|q| !q.is_empty()),
                tags: Vec::new(),
                created_at: r.get(7)?,
                updated_at: r.get(8)?,
            })
        })
        .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        .map_err(db_err("NOTES_FETCH_FAILED"))?;
    notes.extend(reader);

    for n in notes.iter_mut() {
        if let Some(t) = tags.get(&(n.source.clone(), n.id.clone())) {
            n.tags = t.clone();
        }
    }
    Ok(notes)
}

fn set_tags(conn: &Connection, source: &str, id: &str, tags: &[String]) -> Result<(), String> {
    ensure_tags_table(conn)?;
    let tags = clean_tags(tags);
    if tags.is_empty() {
        conn.execute("DELETE FROM local_note_tags WHERE source = ?1 AND note_id = ?2", params![source, id])
            .map_err(db_err("NOTES_TAGS_FAILED"))?;
    } else {
        let json = serde_json::to_string(&tags).map_err(|e| format!("NOTES_TAGS_FAILED: {e}"))?;
        conn.execute(
            "INSERT INTO local_note_tags (source, note_id, tags) VALUES (?1, ?2, ?3)
             ON CONFLICT(source, note_id) DO UPDATE SET tags = excluded.tags",
            params![source, id, json],
        )
        .map_err(db_err("NOTES_TAGS_FAILED"))?;
    }
    Ok(())
}

/// Save what the inline editor holds. `None` leaves a field alone. A reader note has no
/// label (its text is the note), so a label sent for one is ignored.
pub fn update_local_note(
    conn: &Connection,
    source: &str,
    id: &str,
    label: Option<String>,
    note: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<(), String> {
    match source {
        "podcast" => {
            let changed = conn
                .execute(
                    "UPDATE podcast_bookmarks
                     SET label = CASE WHEN ?2 THEN ?3 ELSE label END,
                         note  = CASE WHEN ?4 THEN ?5 ELSE note END
                     WHERE id = ?1",
                    params![id, label.is_some(), blank_to_none(label), note.is_some(), blank_to_none(note)],
                )
                .map_err(db_err("NOTE_UPDATE_FAILED"))?;
            if changed == 0 {
                return Err("NOTE_NOT_FOUND".into());
            }
        }
        "reader" => {
            if let Some(body) = note {
                let body: String = body.trim().chars().take(8000).collect();
                let changed = conn
                    .execute(
                        "UPDATE reader_notes SET body = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
                        params![id, body],
                    )
                    .map_err(db_err("NOTE_UPDATE_FAILED"))?;
                if changed == 0 {
                    return Err("NOTE_NOT_FOUND".into());
                }
            }
        }
        _ => return Err("NOTE_SOURCE_UNKNOWN".into()),
    }
    if let Some(tags) = tags {
        set_tags(conn, source, id, &tags)?;
    }
    Ok(())
}

/// Delete exactly the notes named, each from its own store. Returns how many went.
pub fn delete_local_notes(conn: &Connection, items: &[NoteRef]) -> Result<i64, String> {
    ensure_tags_table(conn)?;
    let mut deleted = 0i64;
    for it in items {
        let sql = match it.source.as_str() {
            "podcast" => "DELETE FROM podcast_bookmarks WHERE id = ?1",
            "reader" => "DELETE FROM reader_notes WHERE id = ?1",
            _ => return Err("NOTE_SOURCE_UNKNOWN".into()),
        };
        deleted += conn.execute(sql, params![it.id]).map_err(db_err("NOTE_DELETE_FAILED"))? as i64;
        conn.execute(
            "DELETE FROM local_note_tags WHERE source = ?1 AND note_id = ?2",
            params![it.source, it.id],
        )
        .map_err(db_err("NOTE_DELETE_FAILED"))?;
    }
    Ok(deleted)
}

/// Point the player or the reader at the note, and return the route that shows it.
/// The podcast player and the PDF reader both resume from a stored position, so the
/// note's second / page is stored first.
pub fn prepare_open(
    conn: &Connection,
    source: &str,
    source_id: &str,
    position_ms: Option<i64>,
    page: Option<i64>,
) -> Result<String, String> {
    match source {
        "podcast" => {
            if let Some(ms) = position_ms {
                conn.execute(
                    "UPDATE podcast_episodes SET play_position = ?2 WHERE id = ?1",
                    params![source_id, ms.max(0)],
                )
                .map_err(db_err("NOTE_OPEN_FAILED"))?;
            }
            Ok(format!("/podcast/player/{source_id}"))
        }
        "reader" => {
            let kind: String = conn
                .query_row("SELECT kind FROM reader_documents WHERE id = ?1", params![source_id], |r| r.get(0))
                .map_err(|_| "NOTE_SOURCE_GONE".to_string())?;
            // No page: open the document where the reader left it.
            let page = page.map(|p| p.max(1));
            if kind == "text" {
                Ok(match page {
                    Some(p) => format!("/reader/text/{source_id}?page={p}"),
                    None => format!("/reader/text/{source_id}"),
                })
            } else {
                if let Some(p) = page {
                    conn.execute("UPDATE reader_documents SET last_page = ?2 WHERE id = ?1", params![source_id, p])
                        .map_err(db_err("NOTE_OPEN_FAILED"))?;
                }
                Ok(format!("/reader/pdf/{source_id}"))
            }
        }
        _ => Err("NOTE_SOURCE_UNKNOWN".into()),
    }
}

#[tauri::command]
pub fn local_notes_list(state: State<'_, AppState>) -> Result<Vec<LocalNote>, String> {
    list_local_notes(&*lock_db(&state)?)
}

#[tauri::command]
pub fn local_note_update(
    state: State<'_, AppState>,
    source: String,
    id: String,
    label: Option<String>,
    note: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<(), String> {
    update_local_note(&*lock_db(&state)?, &source, &id, label, note, tags)
}

#[tauri::command]
pub fn local_notes_delete(state: State<'_, AppState>, items: Vec<NoteRef>) -> Result<i64, String> {
    delete_local_notes(&*lock_db(&state)?, &items)
}

#[tauri::command]
pub fn local_note_prepare_open(
    state: State<'_, AppState>,
    source: String,
    source_id: String,
    position_ms: Option<i64>,
    page: Option<i64>,
) -> Result<String, String> {
    prepare_open(&*lock_db(&state)?, &source, &source_id, position_ms, page)
}

// ── Export helpers (shared with the Vocabulary page) ─────────────────────────

/// Write an export to the file the user chose in the save dialog.
pub fn write_text_file(path: &str, content: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("EXPORT_NO_PATH".into());
    }
    std::fs::write(path, content).map_err(|e| format!("EXPORT_WRITE_FAILED: {e}"))
}

/// Write a printable page to the temp folder and open it in the default browser, which
/// prints it: the app's own webview has no print dialog.
pub fn open_printable(html: &str) -> Result<(), String> {
    let path = std::env::temp_dir().join("flexilingo-notes-print.html");
    std::fs::write(&path, html).map_err(|e| format!("EXPORT_WRITE_FAILED: {e}"))?;
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg(&path).status();
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("cmd").args(["/C", "start", ""]).arg(&path).status();
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let status = std::process::Command::new("xdg-open").arg(&path).status();
    match status {
        Ok(s) if s.success() => Ok(()),
        _ => Err("EXPORT_OPEN_FAILED".into()),
    }
}

#[tauri::command]
pub fn export_save_text(path: String, content: String) -> Result<(), String> {
    write_text_file(&path, &content)
}

#[tauri::command]
pub fn export_open_printable(html: String) -> Result<(), String> {
    open_printable(&html)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::run_migrations;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO podcast_feeds (id, feed_url, title, language) VALUES ('f1','https://e.com/rss','Feed','en')", []).unwrap();
        conn.execute("INSERT INTO podcast_episodes (id, feed_id, title, audio_url, duration_seconds) VALUES ('e1','f1','Episode One','https://e.com/a.mp3',60)", []).unwrap();
        conn.execute("INSERT INTO podcast_bookmarks (id, episode_id, position_ms, label, note) VALUES ('b1','e1',12000,'Idiom','a note')", []).unwrap();
        conn.execute("INSERT INTO reader_documents (id, title, original_filename, kind, file_path) VALUES ('d1','Doc','doc.pdf','pdf','/x/doc.pdf')", []).unwrap();
        conn.execute("INSERT INTO reader_documents (id, title, original_filename, kind, file_path) VALUES ('d2','Text','t.txt','text','/x/t.txt')", []).unwrap();
        conn.execute("INSERT INTO reader_notes (id, document_id, page_number, quote, body) VALUES ('n1','d1',3,'quoted words','reader body')", []).unwrap();
        conn
    }

    #[test]
    fn lists_both_stores_with_their_source() {
        let conn = db();
        let notes = list_local_notes(&conn).unwrap();
        assert_eq!(notes.len(), 2);
        let p = notes.iter().find(|n| n.source == "podcast").unwrap();
        assert_eq!((p.id.as_str(), p.source_title.as_deref(), p.position_ms), ("b1", Some("Episode One"), Some(12000)));
        let r = notes.iter().find(|n| n.source == "reader").unwrap();
        assert_eq!((r.page, r.excerpt.as_deref(), r.note.as_deref()), (Some(3), Some("quoted words"), Some("reader body")));
    }

    #[test]
    fn tags_are_cleaned_and_stored_per_source() {
        let conn = db();
        update_local_note(&conn, "podcast", "b1", None, None, Some(vec![" Verbs ".into(), "verbs".into(), "".into(), "B2".into()])).unwrap();
        let notes = list_local_notes(&conn).unwrap();
        assert_eq!(notes.iter().find(|n| n.id == "b1").unwrap().tags, vec!["verbs", "b2"]);
        assert!(notes.iter().find(|n| n.id == "n1").unwrap().tags.is_empty());
        update_local_note(&conn, "podcast", "b1", None, None, Some(vec![])).unwrap();
        assert!(list_local_notes(&conn).unwrap().iter().all(|n| n.tags.is_empty()));
    }

    #[test]
    fn edit_changes_only_the_named_store_and_keeps_reader_anchors() {
        let conn = db();
        update_local_note(&conn, "podcast", "b1", Some("New label".into()), Some("  ".into()), None).unwrap();
        update_local_note(&conn, "reader", "n1", Some("ignored".into()), Some("edited".into()), None).unwrap();
        let notes = list_local_notes(&conn).unwrap();
        let p = notes.iter().find(|n| n.id == "b1").unwrap();
        assert_eq!((p.label.as_deref(), p.note.as_deref()), (Some("New label"), None));
        let r = notes.iter().find(|n| n.id == "n1").unwrap();
        assert_eq!((r.note.as_deref(), r.excerpt.as_deref(), r.page), (Some("edited"), Some("quoted words"), Some(3)));
        assert_eq!(update_local_note(&conn, "podcast", "nope", None, Some("x".into()), None), Err("NOTE_NOT_FOUND".into()));
    }

    #[test]
    fn delete_never_crosses_stores_even_when_ids_collide() {
        let conn = db();
        // A reader note that shares the podcast bookmark's id.
        conn.execute("INSERT INTO reader_notes (id, document_id, page_number, body) VALUES ('b1','d1',1,'same id')", []).unwrap();
        update_local_note(&conn, "podcast", "b1", None, None, Some(vec!["x".into()])).unwrap();
        let n = delete_local_notes(&conn, &[NoteRef { source: "podcast".into(), id: "b1".into() }]).unwrap();
        assert_eq!(n, 1);
        let left = list_local_notes(&conn).unwrap();
        assert_eq!(left.len(), 2);
        assert!(left.iter().all(|n| n.source == "reader"));
        let n = delete_local_notes(&conn, &[NoteRef { source: "reader".into(), id: "n1".into() }, NoteRef { source: "reader".into(), id: "b1".into() }]).unwrap();
        assert_eq!(n, 2);
        assert!(list_local_notes(&conn).unwrap().is_empty());
        assert!(delete_local_notes(&conn, &[NoteRef { source: "cloud".into(), id: "1".into() }]).is_err());
    }

    #[test]
    fn export_writes_the_chosen_file_and_refuses_an_empty_path() {
        let path = std::env::temp_dir().join("flexilingo-export-test.txt");
        write_text_file(path.to_str().unwrap(), "a,b").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "a,b");
        std::fs::remove_file(&path).ok();
        assert_eq!(write_text_file("  ", "x"), Err("EXPORT_NO_PATH".into()));
    }

    #[test]
    fn open_routes_and_resume_positions() {
        let conn = db();
        assert_eq!(prepare_open(&conn, "podcast", "e1", Some(12000), None).unwrap(), "/podcast/player/e1");
        let pos: i64 = conn.query_row("SELECT play_position FROM podcast_episodes WHERE id='e1'", [], |r| r.get(0)).unwrap();
        assert_eq!(pos, 12000);
        assert_eq!(prepare_open(&conn, "reader", "d1", None, Some(3)).unwrap(), "/reader/pdf/d1");
        let page: i64 = conn.query_row("SELECT last_page FROM reader_documents WHERE id='d1'", [], |r| r.get(0)).unwrap();
        assert_eq!(page, 3);
        assert_eq!(prepare_open(&conn, "reader", "d2", None, Some(2)).unwrap(), "/reader/text/d2?page=2");
        assert_eq!(prepare_open(&conn, "reader", "d1", None, None).unwrap(), "/reader/pdf/d1");
        let page: i64 = conn.query_row("SELECT last_page FROM reader_documents WHERE id='d1'", [], |r| r.get(0)).unwrap();
        assert_eq!(page, 3, "opening the document itself keeps the reader's place");
        assert_eq!(prepare_open(&conn, "reader", "d2", None, None).unwrap(), "/reader/text/d2");
        assert_eq!(prepare_open(&conn, "reader", "gone", None, Some(2)), Err("NOTE_SOURCE_GONE".into()));
    }
}
