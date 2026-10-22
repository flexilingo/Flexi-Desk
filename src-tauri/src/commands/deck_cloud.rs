//! Where a local deck meets the website's decks: pushing one up (Publish / Share), and
//! saving a public deck from Explore into the local library.
//!
//! The network calls themselves go through `supabase_call` from the UI. This module owns
//! only the SQLite side — the snapshot a push sends, the cloud-id bookkeeping, and the
//! idempotent import — so each can be tested against an in-memory database.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::commands::srs::{fetch_deck, DeckWithStats};
use crate::AppState;

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

// ── Snapshot for a push ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SnapshotCard {
    pub front: String,
    pub back: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub language: String,
    pub native_language: Option<String>,
    pub tags: Vec<String>,
    pub is_public: bool,
    pub source_url: Option<String>,
    pub source_type: Option<String>,
    pub source_public: bool,
    pub cloud_deck_id: Option<String>,
    pub cards: Vec<SnapshotCard>,
}

/// A card's notes as the website reads them: the card's own JSON plus whatever the
/// dictionary row knows that the JSON does not say yet. Existing keys always win — the
/// user's edits live in the JSON, the dictionary row is only a fallback. `learning_lang`
/// is stamped so the website picks the right voice for a card in a non-English deck.
pub(crate) fn merge_notes(
    notes: Option<&str>,
    learning_lang: &str,
    definition: Option<&str>,
    pos: Option<&str>,
    cefr: Option<&str>,
    ipa: Option<&str>,
    example: Option<&str>,
) -> Option<String> {
    let mut obj = notes
        .and_then(|n| serde_json::from_str::<Value>(n).ok())
        .and_then(|v| match v {
            Value::Object(m) => Some(m),
            _ => None,
        })
        .unwrap_or_default();

    let mut put = |key: &str, val: Option<&str>| {
        if let Some(v) = val.map(str::trim).filter(|v| !v.is_empty()) {
            obj.entry(key.to_string()).or_insert_with(|| json!(v));
        }
    };
    put("definition", definition);
    put("part_of_speech", pos);
    put("cefr_level", cefr);
    put("ipa", ipa);

    if let Some(ex) = example.map(str::trim).filter(|e| !e.is_empty()) {
        let has_examples = obj
            .get("examples")
            .and_then(Value::as_array)
            .is_some_and(|a| !a.is_empty());
        if !has_examples {
            obj.insert("examples".to_string(), json!([{ "source": ex, "target": "" }]));
        }
    }
    if !learning_lang.is_empty() {
        obj.entry("learning_lang".to_string()).or_insert_with(|| json!(learning_lang));
    }

    if obj.is_empty() {
        None
    } else {
        serde_json::to_string(&Value::Object(obj)).ok()
    }
}

pub(crate) fn snapshot(conn: &Connection, deck_id: &str) -> Result<DeckSnapshot, String> {
    let deck = fetch_deck(conn, deck_id).map_err(|_| "DECK_NOT_FOUND".to_string())?;
    let (source_url, source_type, source_public) =
        (deck.source_url.clone(), deck.source_type.clone(), deck.source_public);

    let mut stmt = conn
        .prepare(
            "SELECT dc.front, dc.back, dc.notes, v.translation, v.definition, v.pos,
                    v.cefr_level, v.phonetic, v.examples
             FROM deck_cards dc
             LEFT JOIN vocabulary v ON v.id = dc.vocabulary_id
             WHERE dc.deck_id = ?1
             ORDER BY dc.order_index ASC, dc.added_at ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params![deck_id], |row| {
            let front: String = row.get(0)?;
            let back: String = row.get(1)?;
            let notes: Option<String> = row.get(2)?;
            let translation: Option<String> = row.get(3)?;
            let merged = merge_notes(
                notes.as_deref(),
                &deck.language,
                row.get::<_, Option<String>>(4)?.as_deref(),
                row.get::<_, Option<String>>(5)?.as_deref(),
                row.get::<_, Option<String>>(6)?.as_deref(),
                row.get::<_, Option<String>>(7)?.as_deref(),
                row.get::<_, Option<String>>(8)?.as_deref(),
            );
            // A card whose own back is empty falls back to its dictionary translation.
            let back = if back.trim().is_empty() { translation.unwrap_or_default() } else { back };
            Ok(SnapshotCard { front, back, notes: merged })
        })
        .map_err(|e| format!("Query error: {e}"))?;
    let cards = rows
        .map(|r| r.map_err(|e| format!("Row error: {e}")))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(DeckSnapshot {
        id: deck.id,
        name: deck.name,
        description: deck.description,
        language: deck.language,
        native_language: deck.native_language,
        tags: deck.tags,
        is_public: deck.is_public,
        source_url,
        source_type,
        source_public,
        cloud_deck_id: deck.cloud_deck_id,
        cards,
    })
}

#[tauri::command]
pub fn deck_cloud_snapshot(state: State<'_, AppState>, deck_id: String) -> Result<DeckSnapshot, String> {
    let conn = lock_db(&state)?;
    snapshot(&conn, &deck_id)
}

/// Remember which website deck a local deck was pushed to (`None` forgets it), and the
/// clone count the website last reported. The cloud id is unique: if another local deck
/// still carries it, that stale link is dropped first.
pub(crate) fn set_cloud_link(
    conn: &Connection,
    deck_id: &str,
    cloud_deck_id: Option<&str>,
    total_clones: Option<i64>,
) -> Result<(), String> {
    if let Some(cloud) = cloud_deck_id {
        conn.execute(
            "UPDATE decks SET cloud_deck_id = NULL WHERE cloud_deck_id = ?1 AND id != ?2",
            rusqlite::params![cloud, deck_id],
        )
        .map_err(|e| format!("Update error: {e}"))?;
    }
    conn.execute(
        "UPDATE decks SET cloud_deck_id = ?2, total_clones = COALESCE(?3, total_clones) WHERE id = ?1",
        rusqlite::params![deck_id, cloud_deck_id, total_clones],
    )
    .map_err(|e| format!("Update error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn deck_set_cloud_link(
    state: State<'_, AppState>,
    deck_id: String,
    cloud_deck_id: Option<String>,
    total_clones: Option<i64>,
) -> Result<DeckWithStats, String> {
    let conn = lock_db(&state)?;
    set_cloud_link(&conn, &deck_id, cloud_deck_id.as_deref(), total_clones)?;
    fetch_deck(&conn, &deck_id)
}

// ── Saving a public deck into the library ──────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct PublicCardInput {
    pub front: String,
    pub back: String,
    pub notes: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportPublicDeckInput {
    /// The public deck's id on the website.
    pub original_deck_id: String,
    pub title: String,
    pub description: Option<String>,
    /// Language the cards are written in.
    pub language: String,
    /// Language of the meanings in this copy.
    pub native_language: String,
    pub tags: Option<Vec<String>>,
    pub source_url: Option<String>,
    pub source_type: Option<String>,
    pub cover_url: Option<String>,
    pub algorithm: Option<String>,
    /// Set when the copy was made by the website (a cloud translation): the id of the
    /// user's own cloud deck, so a later Publish updates it instead of creating another.
    pub cloud_deck_id: Option<String>,
    pub cards: Vec<PublicCardInput>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub deck: DeckWithStats,
    /// False when the library already held this deck in this language pair.
    pub created: bool,
    pub added: i64,
    pub skipped: i64,
}

/// Save a public deck into the library — or top up the copy that is already there.
///
/// One local copy exists per (public deck, cards language, meanings language): the website
/// lets a learner keep the same deck in several meaning languages, so the pair is part of
/// the key. Importing again never duplicates the deck, and never touches cards the learner
/// already has (their progress and edits stay): only cards whose front text is new are
/// added.
pub(crate) fn import_public_deck(
    conn: &Connection,
    input: &ImportPublicDeckInput,
) -> Result<ImportResult, String> {
    if input.original_deck_id.trim().is_empty() || input.title.trim().is_empty() {
        return Err("INVALID_REQUEST".to_string());
    }
    let algorithm = match input.algorithm.as_deref() {
        Some(a @ ("leitner" | "sm2" | "fsrs")) => a,
        _ => "fsrs",
    };
    let tags_json = serde_json::to_string(&input.tags.clone().unwrap_or_default())
        .unwrap_or_else(|_| "[]".to_string());

    let tx = conn.unchecked_transaction().map_err(|e| format!("Begin error: {e}"))?;

    let existing: Option<(String, String)> = tx
        .query_row(
            "SELECT id, algorithm FROM decks
             WHERE original_deck_id = ?1 AND language = ?2 AND COALESCE(native_language, '') = ?3
             ORDER BY created_at ASC LIMIT 1",
            rusqlite::params![input.original_deck_id, input.language, input.native_language],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();

    let (deck_id, algorithm, created) = match existing {
        Some((id, algo)) => {
            // Same deck, refreshed: the title and cover may have changed upstream; the
            // learner's own title is kept only if they renamed it — we can't tell, so the
            // title is left alone and only the picture and source follow the website.
            tx.execute(
                "UPDATE decks SET cover_url = COALESCE(?2, cover_url),
                                  source_url = COALESCE(?3, source_url),
                                  source_type = COALESCE(?4, source_type),
                                  updated_at = datetime('now')
                 WHERE id = ?1",
                rusqlite::params![id, input.cover_url, input.source_url, input.source_type],
            )
            .map_err(|e| format!("Update error: {e}"))?;
            (id, algo, false)
        }
        None => {
            let id: String = tx
                .query_row(
                    "INSERT INTO decks (id, name, description, language, native_language, algorithm,
                                        tags, original_deck_id, source_url, source_type, cover_url,
                                        cloud_deck_id)
                     VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                     RETURNING id",
                    rusqlite::params![
                        input.title.trim(),
                        input.description,
                        input.language,
                        input.native_language,
                        algorithm,
                        tags_json,
                        input.original_deck_id,
                        input.source_url,
                        input.source_type,
                        input.cover_url,
                        input.cloud_deck_id,
                    ],
                    |r| r.get(0),
                )
                .map_err(|e| format!("Insert error: {e}"))?;
            (id, algorithm.to_string(), true)
        }
    };

    let mut have: std::collections::HashSet<String> = {
        let mut stmt = tx
            .prepare("SELECT lower(front) FROM deck_cards WHERE deck_id = ?1")
            .map_err(|e| format!("Query error: {e}"))?;
        let rows = stmt
            .query_map(rusqlite::params![deck_id], |r| r.get::<_, String>(0))
            .map_err(|e| format!("Query error: {e}"))?;
        rows.filter_map(Result::ok).collect()
    };
    let mut next_order: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(order_index) + 1, 0) FROM deck_cards WHERE deck_id = ?1",
            rusqlite::params![deck_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let (mut added, mut skipped) = (0i64, 0i64);
    for card in &input.cards {
        let front = card.front.trim();
        if front.is_empty() || !have.insert(front.to_lowercase()) {
            skipped += 1;
            continue;
        }
        let tags = serde_json::to_string(&card.tags.clone().unwrap_or_default())
            .unwrap_or_else(|_| "[]".to_string());
        let card_id: String = tx
            .query_row(
                "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back, notes, tags, order_index)
                 VALUES (lower(hex(randomblob(16))), ?1, NULL, ?2, ?3, ?4, ?5, ?6)
                 RETURNING id",
                rusqlite::params![deck_id, front, card.back.trim(), card.notes, tags, next_order],
                |r| r.get(0),
            )
            .map_err(|e| format!("Card insert error: {e}"))?;
        tx.execute(
            "INSERT INTO srs_progress (id, card_id, algorithm, state, interval_days, due_date)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, 'new', 0, datetime('now'))",
            rusqlite::params![card_id, algorithm],
        )
        .map_err(|e| format!("Progress insert error: {e}"))?;
        next_order += 1;
        added += 1;
    }

    tx.execute(
        "UPDATE decks SET card_count = (SELECT COUNT(*) FROM deck_cards WHERE deck_id = ?1),
                          updated_at = datetime('now')
         WHERE id = ?1",
        rusqlite::params![deck_id],
    )
    .map_err(|e| format!("Count update error: {e}"))?;
    tx.commit().map_err(|e| format!("Commit error: {e}"))?;

    Ok(ImportResult { deck: fetch_deck(conn, &deck_id)?, created, added, skipped })
}

#[tauri::command]
pub fn deck_import_public(
    state: State<'_, AppState>,
    input: ImportPublicDeckInput,
) -> Result<ImportResult, String> {
    let conn = lock_db(&state)?;
    import_public_deck(&conn, &input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::run_migrations;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    fn input(native: &str, fronts: &[&str]) -> ImportPublicDeckInput {
        ImportPublicDeckInput {
            original_deck_id: "pub-1".into(),
            title: "Toronto Words".into(),
            description: None,
            language: "en".into(),
            native_language: native.into(),
            tags: Some(vec!["travel".into()]),
            source_url: None,
            source_type: None,
            cover_url: Some("https://example.com/c.jpg".into()),
            algorithm: None,
            cloud_deck_id: None,
            cards: fronts
                .iter()
                .map(|f| PublicCardInput {
                    front: (*f).into(),
                    back: format!("{f}-meaning"),
                    notes: None,
                    tags: Some(vec!["a".into()]),
                })
                .collect(),
        }
    }

    fn has_column(conn: &Connection, col: &str) -> bool {
        let mut stmt = conn.prepare("PRAGMA table_info(decks)").unwrap();
        let names: Vec<String> = stmt.query_map([], |r| r.get::<_, String>(1)).unwrap().map(Result::unwrap).collect();
        names.iter().any(|n| n == col)
    }

    /// V037 (dashboard overview) and V038 (deck language pair) are separate steps that must
    /// run in order, V038 only once, and leave existing decks intact.
    #[test]
    fn v038_adds_the_pair_columns_after_v037_and_keeps_existing_decks() {
        use crate::db::schema::run_migrations_through;
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations_through(&conn, "V037").unwrap();
        assert!(!has_column(&conn, "native_language"), "V038 must not run before it is asked for");
        conn.execute("INSERT INTO decks (id, name, language) VALUES ('old', 'Old deck', 'fr')", []).unwrap();

        run_migrations(&conn).unwrap();
        for col in ["native_language", "cover_url", "source_public"] {
            assert!(has_column(&conn, col), "decks.{col}");
        }
        run_migrations(&conn).unwrap(); // a second launch is a no-op
        let d = fetch_deck(&conn, "old").unwrap();
        assert_eq!((d.language.as_str(), d.native_language, d.source_public), ("fr", None, false));
        let applied: i64 = conn
            .query_row("SELECT COUNT(*) FROM _migrations WHERE version IN ('V037', 'V038')", [], |r| r.get(0))
            .unwrap();
        assert_eq!(applied, 2);
    }

    #[test]
    fn import_creates_deck_cards_and_progress() {
        let conn = db();
        let r = import_public_deck(&conn, &input("fr", &["streetcar", "ferry"])).unwrap();
        assert!(r.created);
        assert_eq!((r.added, r.skipped), (2, 0));
        assert_eq!(r.deck.card_count, 2);
        assert_eq!(r.deck.original_deck_id.as_deref(), Some("pub-1"));
        assert_eq!(r.deck.native_language.as_deref(), Some("fr"));
        assert_eq!(r.deck.tags, vec!["travel"]);
        assert_eq!(r.deck.new_cards, 2, "every cloned card starts as new");
        let null_vocab: i64 = conn
            .query_row("SELECT COUNT(*) FROM deck_cards WHERE vocabulary_id IS NULL", [], |r| r.get(0))
            .unwrap();
        assert_eq!(null_vocab, 2);
    }

    #[test]
    fn importing_again_updates_instead_of_duplicating() {
        let conn = db();
        let first = import_public_deck(&conn, &input("fr", &["streetcar", "ferry"])).unwrap();
        // Progress on a card must survive the refresh.
        conn.execute("UPDATE srs_progress SET review_count = 5", []).unwrap();

        let again = import_public_deck(&conn, &input("fr", &["Streetcar", "ferry", "subway"])).unwrap();
        assert!(!again.created);
        assert_eq!(again.deck.id, first.deck.id);
        assert_eq!((again.added, again.skipped), (1, 2), "only the new front text is added");
        assert_eq!(again.deck.card_count, 3);
        let decks: i64 = conn.query_row("SELECT COUNT(*) FROM decks", [], |r| r.get(0)).unwrap();
        assert_eq!(decks, 1);
        let kept: i64 = conn
            .query_row("SELECT COUNT(*) FROM srs_progress WHERE review_count = 5", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, 2);
    }

    #[test]
    fn another_meaning_language_is_its_own_copy() {
        let conn = db();
        let fr = import_public_deck(&conn, &input("fr", &["ferry"])).unwrap();
        let es = import_public_deck(&conn, &input("es", &["ferry"])).unwrap();
        assert!(es.created);
        assert_ne!(fr.deck.id, es.deck.id);
    }

    #[test]
    fn a_copy_without_a_cloud_id_never_collides_on_the_unique_index() {
        let conn = db();
        import_public_deck(&conn, &input("fr", &["a"])).unwrap();
        import_public_deck(&conn, &input("es", &["a"])).unwrap();
        let linked: i64 = conn
            .query_row("SELECT COUNT(*) FROM decks WHERE cloud_deck_id IS NOT NULL", [], |r| r.get(0))
            .unwrap();
        assert_eq!(linked, 0);
    }

    #[test]
    fn blank_request_is_refused() {
        let conn = db();
        let mut bad = input("fr", &["a"]);
        bad.title = "  ".into();
        assert_eq!(import_public_deck(&conn, &bad).unwrap_err(), "INVALID_REQUEST");
    }

    #[test]
    fn snapshot_carries_cards_with_dictionary_fallbacks() {
        let conn = db();
        conn.execute("INSERT INTO decks (id, name, language, native_language) VALUES ('d', 'Mine', 'fr', 'en')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO vocabulary (id, word, language, translation, definition, pos, cefr_level)
             VALUES (1, 'bonjour', 'fr', 'hello', 'a greeting', 'interjection', 'A1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back, order_index)
             VALUES ('c1', 'd', 1, 'bonjour', '', 0)",
            [],
        )
        .unwrap();
        let snap = snapshot(&conn, "d").unwrap();
        assert_eq!(snap.cards.len(), 1);
        assert_eq!(snap.cards[0].back, "hello", "empty back falls back to the translation");
        let notes: Value = serde_json::from_str(snap.cards[0].notes.as_deref().unwrap()).unwrap();
        assert_eq!(notes["definition"], "a greeting");
        assert_eq!(notes["part_of_speech"], "interjection");
        assert_eq!(notes["learning_lang"], "fr");
        assert!(snapshot(&conn, "missing").is_err());
    }

    #[test]
    fn merge_notes_keeps_what_the_card_already_says() {
        let existing = r#"{"definition":"mine","examples":[{"source":"S","target":"T"}]}"#;
        let out = merge_notes(Some(existing), "en", Some("theirs"), None, Some("B1"), None, Some("other")).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["definition"], "mine");
        assert_eq!(v["cefr_level"], "B1");
        assert_eq!(v["examples"][0]["source"], "S", "existing examples are not replaced");
        assert_eq!(merge_notes(None, "", None, None, None, None, None), None);
    }

    #[test]
    fn cloud_link_is_unique_and_movable() {
        let conn = db();
        conn.execute("INSERT INTO decks (id, name, language) VALUES ('a', 'A', 'en'), ('b', 'B', 'en')", [])
            .unwrap();
        set_cloud_link(&conn, "a", Some("cloud-1"), Some(3)).unwrap();
        set_cloud_link(&conn, "b", Some("cloud-1"), None).unwrap();
        let a = fetch_deck(&conn, "a").unwrap();
        let b = fetch_deck(&conn, "b").unwrap();
        assert_eq!(a.cloud_deck_id, None, "the stale link moved to b");
        assert_eq!(b.cloud_deck_id.as_deref(), Some("cloud-1"));
        assert_eq!(a.total_clones, 3);
        set_cloud_link(&conn, "b", None, None).unwrap();
        assert_eq!(fetch_deck(&conn, "b").unwrap().cloud_deck_id, None);
    }
}
