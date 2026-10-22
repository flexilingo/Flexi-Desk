//! Offline copy of the website's Cheatsheet.
//!
//! The network half stays in the UI (`supabaseCall`); this module is only the
//! local store behind it. Every index, topic and verb response the UI fetches is
//! kept here as the JSON text it arrived as, keyed by language + kind + key, so
//! a page that was opened once opens again with no connection, and the whole
//! book can be downloaded ahead of time.
//!
//! Kinds the UI writes: `index`, `topic`, `verbs`, `verb`. For each of them
//! `key` carries the explain locale (`en`, `en:petits-mots`, `en:prendre`), so
//! one language can hold several translations side by side.
//!
//! Every function takes a plain `&Connection` so it can be tested in memory.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CachedEntry {
    pub key: String,
    /// The response body, exactly as the server sent it.
    pub body: String,
    /// UTC, `YYYY-MM-DD HH:MM:SS`.
    pub fetched_at: String,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct CacheStats {
    pub indexes: i64,
    pub topics: i64,
    pub verb_lists: i64,
    pub verbs: i64,
    pub bytes: i64,
    /// The newest `fetched_at` of any row, if there is one.
    pub last_fetched_at: Option<String>,
}

const KINDS: [&str; 4] = ["index", "topic", "verbs", "verb"];

fn check(lang: &str, kind: &str, key: &str) -> Result<(), String> {
    if lang.is_empty() || lang.len() > 8 || !lang.chars().all(|c| c.is_ascii_lowercase()) {
        return Err("INVALID_LANGUAGE".into());
    }
    if !KINDS.contains(&kind) {
        return Err("INVALID_KIND".into());
    }
    if key.is_empty() || key.len() > 200 {
        return Err("INVALID_KEY".into());
    }
    Ok(())
}

pub fn cache_get(
    conn: &Connection,
    lang: &str,
    kind: &str,
    key: &str,
) -> Result<Option<CachedEntry>, String> {
    check(lang, kind, key)?;
    conn.query_row(
        "SELECT key, body, fetched_at FROM cheatsheet_cache WHERE lang = ?1 AND kind = ?2 AND key = ?3",
        params![lang, kind, key],
        |r| {
            Ok(CachedEntry {
                key: r.get(0)?,
                body: r.get(1)?,
                fetched_at: r.get(2)?,
            })
        },
    )
    .optional()
    .map_err(|e| format!("Cheatsheet cache read failed: {e}"))
}

/// Writes (or replaces) one response. An empty body is refused: a blank row would
/// later be served as if it were the page.
pub fn cache_put(
    conn: &Connection,
    lang: &str,
    kind: &str,
    key: &str,
    body: &str,
) -> Result<(), String> {
    check(lang, kind, key)?;
    if body.trim().is_empty() {
        return Err("EMPTY_BODY".into());
    }
    conn.execute(
        "INSERT INTO cheatsheet_cache (lang, kind, key, body, fetched_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT(lang, kind, key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at",
        params![lang, kind, key, body],
    )
    .map_err(|e| format!("Cheatsheet cache write failed: {e}"))?;
    Ok(())
}

/// Every cached row of one kind whose key starts with `prefix` (`en:` for all of a
/// locale's topics). The offline search reads the topic bodies through this.
pub fn cache_list(
    conn: &Connection,
    lang: &str,
    kind: &str,
    prefix: &str,
) -> Result<Vec<CachedEntry>, String> {
    check(lang, kind, "x")?;
    // `LIKE` treats `%` and `_` as wildcards; a locale prefix never contains them,
    // but the guard keeps a stray one from matching the whole table.
    if prefix.contains('%') || prefix.contains('_') {
        return Err("INVALID_KEY".into());
    }
    let mut stmt = conn
        .prepare(
            "SELECT key, body, fetched_at FROM cheatsheet_cache
             WHERE lang = ?1 AND kind = ?2 AND key LIKE ?3 || '%' ORDER BY key",
        )
        .map_err(|e| format!("Cheatsheet cache list failed: {e}"))?;
    let rows = stmt
        .query_map(params![lang, kind, prefix], |r| {
            Ok(CachedEntry {
                key: r.get(0)?,
                body: r.get(1)?,
                fetched_at: r.get(2)?,
            })
        })
        .map_err(|e| format!("Cheatsheet cache list failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Cheatsheet cache list failed: {e}"))
}

/// Just the keys of a kind — cheap enough to ask for every page, so the UI can
/// say how many topics of a locale are already on this computer.
pub fn cache_keys(conn: &Connection, lang: &str, kind: &str, prefix: &str) -> Result<Vec<String>, String> {
    check(lang, kind, "x")?;
    if prefix.contains('%') || prefix.contains('_') {
        return Err("INVALID_KEY".into());
    }
    let mut stmt = conn
        .prepare(
            "SELECT key FROM cheatsheet_cache WHERE lang = ?1 AND kind = ?2 AND key LIKE ?3 || '%' ORDER BY key",
        )
        .map_err(|e| format!("Cheatsheet cache keys failed: {e}"))?;
    let rows = stmt
        .query_map(params![lang, kind, prefix], |r| r.get::<_, String>(0))
        .map_err(|e| format!("Cheatsheet cache keys failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Cheatsheet cache keys failed: {e}"))
}

pub fn cache_stats(conn: &Connection, lang: &str) -> Result<CacheStats, String> {
    check(lang, "index", "x")?;
    let mut stats = CacheStats::default();
    let mut stmt = conn
        .prepare(
            "SELECT kind, COUNT(*), COALESCE(SUM(LENGTH(body)), 0), MAX(fetched_at)
             FROM cheatsheet_cache WHERE lang = ?1 GROUP BY kind",
        )
        .map_err(|e| format!("Cheatsheet cache stats failed: {e}"))?;
    let rows = stmt
        .query_map(params![lang], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| format!("Cheatsheet cache stats failed: {e}"))?;
    for row in rows {
        let (kind, count, bytes, newest) = row.map_err(|e| format!("Cheatsheet cache stats failed: {e}"))?;
        match kind.as_str() {
            "index" => stats.indexes = count,
            "topic" => stats.topics = count,
            "verbs" => stats.verb_lists = count,
            "verb" => stats.verbs = count,
            _ => {}
        }
        stats.bytes += bytes;
        if newest.as_ref() > stats.last_fetched_at.as_ref() {
            stats.last_fetched_at = newest;
        }
    }
    Ok(stats)
}

/// Forgets everything stored for one language.
pub fn cache_clear(conn: &Connection, lang: &str) -> Result<usize, String> {
    check(lang, "index", "x")?;
    conn.execute("DELETE FROM cheatsheet_cache WHERE lang = ?1", params![lang])
        .map_err(|e| format!("Cheatsheet cache clear failed: {e}"))
}

// ── Tauri commands ──────────────────────────────────────

#[tauri::command]
pub fn cheatsheet_cache_get(
    state: State<'_, AppState>,
    lang: String,
    kind: String,
    key: String,
) -> Result<Option<CachedEntry>, String> {
    cache_get(&*lock_db(&state)?, &lang, &kind, &key)
}

#[tauri::command]
pub fn cheatsheet_cache_put(
    state: State<'_, AppState>,
    lang: String,
    kind: String,
    key: String,
    body: String,
) -> Result<(), String> {
    cache_put(&*lock_db(&state)?, &lang, &kind, &key, &body)
}

#[tauri::command]
pub fn cheatsheet_cache_list(
    state: State<'_, AppState>,
    lang: String,
    kind: String,
    prefix: String,
) -> Result<Vec<CachedEntry>, String> {
    cache_list(&*lock_db(&state)?, &lang, &kind, &prefix)
}

#[tauri::command]
pub fn cheatsheet_cache_keys(
    state: State<'_, AppState>,
    lang: String,
    kind: String,
    prefix: String,
) -> Result<Vec<String>, String> {
    cache_keys(&*lock_db(&state)?, &lang, &kind, &prefix)
}

#[tauri::command]
pub fn cheatsheet_cache_stats(state: State<'_, AppState>, lang: String) -> Result<CacheStats, String> {
    cache_stats(&*lock_db(&state)?, &lang)
}

#[tauri::command]
pub fn cheatsheet_cache_clear(state: State<'_, AppState>, lang: String) -> Result<usize, String> {
    cache_clear(&*lock_db(&state)?, &lang)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::schema::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn a_response_is_stored_and_read_back_unchanged() {
        let conn = db();
        assert_eq!(cache_get(&conn, "fr", "topic", "en:petits-mots").unwrap(), None);
        cache_put(&conn, "fr", "topic", "en:petits-mots", r#"{"topic":{"slug":"petits-mots"}}"#).unwrap();
        let got = cache_get(&conn, "fr", "topic", "en:petits-mots").unwrap().unwrap();
        assert_eq!(got.body, r#"{"topic":{"slug":"petits-mots"}}"#);
        assert_eq!(got.key, "en:petits-mots");
    }

    #[test]
    fn a_refresh_replaces_the_row_instead_of_adding_one() {
        let conn = db();
        cache_put(&conn, "fr", "index", "en", "{\"count\":1}").unwrap();
        cache_put(&conn, "fr", "index", "en", "{\"count\":2}").unwrap();
        let rows = cache_list(&conn, "fr", "index", "").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].body, "{\"count\":2}");
    }

    #[test]
    fn locales_and_languages_do_not_leak_into_each_other() {
        let conn = db();
        cache_put(&conn, "fr", "topic", "en:a", "{}").unwrap();
        cache_put(&conn, "fr", "topic", "fa:a", "{\"fa\":1}").unwrap();
        cache_put(&conn, "es", "topic", "en:a", "{\"es\":1}").unwrap();
        assert_eq!(cache_list(&conn, "fr", "topic", "en:").unwrap().len(), 1);
        assert_eq!(cache_keys(&conn, "fr", "topic", "").unwrap(), vec!["en:a", "fa:a"]);
        assert_eq!(cache_get(&conn, "es", "topic", "en:a").unwrap().unwrap().body, "{\"es\":1}");
    }

    #[test]
    fn bad_input_is_refused_before_it_reaches_the_table() {
        let conn = db();
        assert_eq!(cache_put(&conn, "fr", "page", "k", "{}"), Err("INVALID_KIND".into()));
        assert_eq!(cache_put(&conn, "FR", "topic", "k", "{}"), Err("INVALID_LANGUAGE".into()));
        assert_eq!(cache_put(&conn, "fr", "topic", "", "{}"), Err("INVALID_KEY".into()));
        assert_eq!(cache_put(&conn, "fr", "topic", "k", "  "), Err("EMPTY_BODY".into()));
        assert_eq!(cache_list(&conn, "fr", "topic", "%"), Err("INVALID_KEY".into()));
    }

    #[test]
    fn stats_count_each_kind_and_clear_forgets_one_language_only() {
        let conn = db();
        cache_put(&conn, "fr", "index", "en", "{\"a\":1}").unwrap();
        cache_put(&conn, "fr", "topic", "en:a", "{}").unwrap();
        cache_put(&conn, "fr", "topic", "en:b", "{}").unwrap();
        cache_put(&conn, "fr", "verbs", "en", "{}").unwrap();
        cache_put(&conn, "fr", "verb", "en:aimer", "{}").unwrap();
        cache_put(&conn, "es", "topic", "en:a", "{}").unwrap();
        let s = cache_stats(&conn, "fr").unwrap();
        assert_eq!((s.indexes, s.topics, s.verb_lists, s.verbs), (1, 2, 1, 1));
        assert!(s.bytes > 0 && s.last_fetched_at.is_some());
        assert_eq!(cache_clear(&conn, "fr").unwrap(), 5);
        assert_eq!(cache_stats(&conn, "fr").unwrap(), CacheStats::default());
        assert_eq!(cache_stats(&conn, "es").unwrap().topics, 1);
    }
}
