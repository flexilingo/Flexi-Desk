use serde::{Deserialize, Serialize};
use tauri::State;

use crate::AppState;

// ── IPC Types ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckWithStats {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub language: String,
    pub algorithm: String,
    pub card_count: i64,
    pub due_today: i64,
    pub new_cards: i64,
    pub mastered: i64,
    pub tags: Vec<String>,
    pub is_public: bool,
    pub original_deck_id: Option<String>,
    pub cloud_deck_id: Option<String>,
    /// Language the meanings are written in. `None` for decks made before V037; the
    /// deck's `language` alone then stands for the whole pair.
    pub native_language: Option<String>,
    pub source_url: Option<String>,
    pub source_type: Option<String>,
    /// The owner lets viewers of the public deck open `source_url`.
    pub source_public: bool,
    pub cover_url: Option<String>,
    pub total_clones: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardFull {
    pub id: String,
    pub deck_id: String,
    /// `None` for cards that aren't backed by a dictionary word — a cloned public deck,
    /// a grammar card, a sentence. See migration V032.
    pub vocabulary_id: Option<i64>,
    pub front: String,
    pub back: String,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub order_index: i64,
    /// Falls back to `front` when there is no vocabulary row.
    pub word: String,
    pub language: String,
    pub translation: Option<String>,
    pub definition: Option<String>,
    pub pos: Option<String>,
    pub cefr_level: Option<String>,
    pub example_sentence: Option<String>,
    pub state: String,
    pub interval_days: f64,
    pub due_date: String,
    pub review_count: i64,
    pub box_number: Option<i64>,
    pub easiness_factor: Option<f64>,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
}

// ── Helper ─────────────────────────────────────────────────

fn lock_db<'a>(state: &'a State<'a, AppState>) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

/// `tags` is a JSON array in a TEXT column. A malformed value must not take the whole
/// deck list down, so it degrades to "no tags".
pub(crate) fn parse_tags(raw: Option<String>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
}

fn dump_tags(tags: &[String]) -> String {
    serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string())
}

/// A deck's stats, shared by every query that returns a `DeckWithStats`.
/// `mastered` mirrors the review runner: FSRS `review` state past a week's interval.
const DECK_SELECT: &str = "
    SELECT d.id, d.name, d.description, d.language, d.algorithm,
           d.card_count, d.created_at, d.updated_at,
           d.tags, d.is_public, d.original_deck_id, d.cloud_deck_id,
           (SELECT COUNT(*) FROM deck_cards dc
            JOIN srs_progress sp ON sp.card_id = dc.id
            WHERE dc.deck_id = d.id AND sp.due_date <= datetime('now')) AS due_today,
           (SELECT COUNT(*) FROM deck_cards dc
            JOIN srs_progress sp ON sp.card_id = dc.id
            WHERE dc.deck_id = d.id AND sp.state = 'new') AS new_cards,
           (SELECT COUNT(*) FROM deck_cards dc
            JOIN srs_progress sp ON sp.card_id = dc.id
            WHERE dc.deck_id = d.id AND sp.state = 'review' AND sp.interval_days >= 7) AS mastered,
           d.native_language, d.source_url, d.source_type,
           COALESCE(d.source_public, 0), d.cover_url, COALESCE(d.total_clones, 0)
    FROM decks d";

fn map_deck(row: &rusqlite::Row) -> rusqlite::Result<DeckWithStats> {
    Ok(DeckWithStats {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        language: row.get(3)?,
        algorithm: row.get(4)?,
        card_count: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        tags: parse_tags(row.get::<_, Option<String>>(8)?),
        is_public: row.get::<_, Option<i64>>(9)?.unwrap_or(0) != 0,
        original_deck_id: row.get(10)?,
        cloud_deck_id: row.get(11)?,
        due_today: row.get(12)?,
        new_cards: row.get(13)?,
        mastered: row.get(14)?,
        native_language: row.get(15)?,
        source_url: row.get(16)?,
        source_type: row.get(17)?,
        source_public: row.get::<_, i64>(18)? != 0,
        cover_url: row.get(19)?,
        total_clones: row.get(20)?,
    })
}

/// One deck with its stats. Shared by every command that hands a deck back.
pub(crate) fn fetch_deck(conn: &rusqlite::Connection, id: &str) -> Result<DeckWithStats, String> {
    let mut stmt = conn
        .prepare(&format!("{DECK_SELECT} WHERE d.id = ?1"))
        .map_err(|e| format!("Query error: {e}"))?;
    stmt.query_row(rusqlite::params![id], map_deck)
        .map_err(|e| format!("Fetch error: {e}"))
}

/// Cards of one deck.
///
/// **`LEFT JOIN vocabulary`, not `JOIN`.** Since V032 a card may have no vocabulary row;
/// an inner join would make every cloned card silently invisible in its own deck.
pub(crate) const DECK_CARDS_SQL: &str = "
    SELECT dc.id, dc.deck_id, dc.vocabulary_id, dc.front, dc.back, dc.notes,
           dc.tags, dc.order_index,
           COALESCE(v.word, dc.front)   AS word,
           COALESCE(v.language, d.language) AS language,
           v.translation, v.definition, v.pos, v.cefr_level, v.examples,
           sp.state, sp.interval_days, sp.due_date, sp.review_count,
           sp.box_number, sp.easiness_factor, sp.stability, sp.difficulty
    FROM deck_cards dc
    JOIN decks d ON d.id = dc.deck_id
    LEFT JOIN vocabulary v ON v.id = dc.vocabulary_id
    LEFT JOIN srs_progress sp ON sp.card_id = dc.id
    WHERE dc.deck_id = ?1
      AND (?2 IS NULL OR dc.front LIKE '%' || ?2 || '%' OR dc.back LIKE '%' || ?2 || '%')
      AND (?5 IS NULL OR EXISTS (SELECT 1 FROM json_each(dc.tags) WHERE value = ?5))
    ORDER BY dc.order_index ASC, dc.added_at DESC
    LIMIT ?3 OFFSET ?4";

fn map_card(row: &rusqlite::Row) -> rusqlite::Result<CardFull> {
    Ok(CardFull {
        id: row.get(0)?,
        deck_id: row.get(1)?,
        vocabulary_id: row.get(2)?,
        front: row.get(3)?,
        back: row.get(4)?,
        notes: row.get(5)?,
        tags: parse_tags(row.get::<_, Option<String>>(6)?),
        order_index: row.get::<_, Option<i64>>(7)?.unwrap_or(0),
        word: row.get(8)?,
        language: row.get(9)?,
        translation: row.get(10)?,
        definition: row.get(11)?,
        pos: row.get(12)?,
        cefr_level: row.get(13)?,
        example_sentence: row.get(14)?,
        state: row.get::<_, Option<String>>(15)?.unwrap_or_else(|| "new".to_string()),
        interval_days: row.get::<_, Option<f64>>(16)?.unwrap_or(0.0),
        due_date: row.get::<_, Option<String>>(17)?.unwrap_or_default(),
        review_count: row.get::<_, Option<i64>>(18)?.unwrap_or(0),
        box_number: row.get(19)?,
        easiness_factor: row.get(20)?,
        stability: row.get(21)?,
        difficulty: row.get(22)?,
    })
}

// ── Deck Commands ──────────────────────────────────────────

#[tauri::command]
pub fn srs_list_decks(state: State<'_, AppState>) -> Result<Vec<DeckWithStats>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(&format!("{DECK_SELECT} ORDER BY d.updated_at DESC"))
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map([], map_deck)
        .map_err(|e| format!("Query error: {e}"))?;

    let mut decks = Vec::new();
    for row in rows {
        decks.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(decks)
}

#[tauri::command]
pub fn srs_create_deck(
    state: State<'_, AppState>,
    name: String,
    language: String,
    algorithm: String,
    description: Option<String>,
    tags: Option<Vec<String>>,
    is_public: Option<bool>,
    native_language: Option<String>,
) -> Result<DeckWithStats, String> {
    let conn = lock_db(&state)?;

    // `RETURNING id` instead of re-selecting by name. The old code did
    // `WHERE name = ?1 AND language = ?2 ORDER BY created_at DESC LIMIT 1`, and
    // `created_at` is only second-granular — creating two decks with the same name
    // inside one second handed back the wrong deck.
    let id: String = conn
        .query_row(
            "INSERT INTO decks (id, name, description, language, algorithm, tags, is_public, native_language)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7)
             RETURNING id",
            rusqlite::params![
                name,
                description,
                language,
                algorithm,
                dump_tags(&tags.unwrap_or_default()),
                i64::from(is_public.unwrap_or(false)),
                native_language,
            ],
            |row| row.get(0),
        )
        .map_err(|e| format!("Insert error: {e}"))?;

    fetch_deck(&conn, &id)
}

#[tauri::command]
pub fn srs_update_deck(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    algorithm: Option<String>,
    tags: Option<Vec<String>>,
    is_public: Option<bool>,
    language: Option<String>,
    native_language: Option<String>,
    source_public: Option<bool>,
) -> Result<DeckWithStats, String> {
    let conn = lock_db(&state)?;

    // One statement, so `updated_at` moves exactly once and a partially-applied edit
    // can't leave the deck half-renamed. NULL means "leave this field alone" — which is
    // also why clearing a description needs an empty string, not null.
    conn.execute(
        "UPDATE decks SET
             name            = COALESCE(?2, name),
             description     = COALESCE(?3, description),
             algorithm       = COALESCE(?4, algorithm),
             tags            = COALESCE(?5, tags),
             is_public       = COALESCE(?6, is_public),
             language        = COALESCE(?7, language),
             native_language = COALESCE(?8, native_language),
             source_public   = COALESCE(?9, source_public),
             updated_at      = datetime('now')
         WHERE id = ?1",
        rusqlite::params![
            id,
            name,
            description,
            algorithm,
            tags.as_deref().map(dump_tags),
            is_public.map(i64::from),
            language,
            native_language,
            source_public.map(i64::from),
        ],
    )
    .map_err(|e| format!("Update error: {e}"))?;

    fetch_deck(&conn, &id)
}

#[tauri::command]
pub fn srs_delete_deck(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = lock_db(&state)?;
    // Delete review sessions referencing this deck (no CASCADE on FK)
    conn.execute("DELETE FROM review_sessions WHERE deck_id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete sessions error: {e}"))?;
    // deck_cards and srs_progress cascade automatically
    conn.execute("DELETE FROM decks WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

// ── Card Commands ──────────────────────────────────────────

#[tauri::command]
pub fn srs_add_card(
    state: State<'_, AppState>,
    deck_id: String,
    word: String,
    language: String,
    translation: Option<String>,
    definition: Option<String>,
    pos: Option<String>,
    cefr_level: Option<String>,
    example_sentence: Option<String>,
    notes: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<CardFull, String> {
    let conn = lock_db(&state)?;

    // A card the deck already has is refused with a code the UI translates, the way the
    // website answers 409 CARD_DUPLICATE. Matching on the front text (not the vocabulary
    // id) is what catches it: every add below creates a fresh vocabulary row.
    let already: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM deck_cards WHERE deck_id = ?1 AND lower(front) = lower(?2)",
            rusqlite::params![deck_id, word.trim()],
            |row| row.get(0),
        )
        .map_err(|e| format!("Duplicate check error: {e}"))?;
    if already > 0 {
        return Err("CARD_DUPLICATE".to_string());
    }

    // Upsert vocabulary
    conn.execute(
        "INSERT INTO vocabulary (word, language, translation, definition, pos, cefr_level, examples, source_module)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'manual')
         ON CONFLICT(rowid) DO NOTHING",
        rusqlite::params![word, language, translation, definition, pos, cefr_level, example_sentence],
    )
    .map_err(|e| format!("Vocab insert error: {e}"))?;

    // Get vocabulary id
    let vocab_id: i64 = conn
        .query_row(
            "SELECT id FROM vocabulary WHERE word = ?1 AND language = ?2 ORDER BY id DESC LIMIT 1",
            rusqlite::params![word, language],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Vocab lookup error: {e}"))?;

    // Get deck algorithm
    let algorithm: String = conn
        .query_row(
            "SELECT algorithm FROM decks WHERE id = ?1",
            rusqlite::params![deck_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Deck lookup error: {e}"))?;

    let back = translation.clone().unwrap_or_default();
    let front = word.clone();
    let tags = tags.unwrap_or_default();

    // New cards go to the end of the deck.
    let order_index: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_index) + 1, 0) FROM deck_cards WHERE deck_id = ?1",
            rusqlite::params![deck_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Insert deck_card
    conn.execute(
        "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back, notes, tags, order_index)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![deck_id, vocab_id, front, back, notes, dump_tags(&tags), order_index],
    )
    .map_err(|e| format!("Card insert error: {e}"))?;

    let card_id: String = conn
        .query_row(
            "SELECT id FROM deck_cards WHERE deck_id = ?1 AND vocabulary_id = ?2",
            rusqlite::params![deck_id, vocab_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Card lookup error: {e}"))?;

    // Create srs_progress
    conn.execute(
        "INSERT INTO srs_progress (id, card_id, algorithm, state, interval_days, due_date)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, 'new', 0, datetime('now'))",
        rusqlite::params![card_id, algorithm],
    )
    .map_err(|e| format!("Progress insert error: {e}"))?;

    // Update deck card_count
    conn.execute(
        "UPDATE decks SET card_count = (SELECT COUNT(*) FROM deck_cards WHERE deck_id = ?1),
                updated_at = datetime('now')
         WHERE id = ?1",
        rusqlite::params![deck_id],
    )
    .map_err(|e| format!("Count update error: {e}"))?;

    Ok(CardFull {
        id: card_id,
        deck_id,
        vocabulary_id: Some(vocab_id),
        front,
        back,
        notes,
        tags,
        order_index,
        word,
        language,
        translation,
        definition,
        pos,
        cefr_level,
        example_sentence,
        state: "new".to_string(),
        interval_days: 0.0,
        due_date: chrono::Utc::now().to_rfc3339(),
        review_count: 0,
        box_number: Some(0),
        easiness_factor: Some(2.5),
        stability: Some(0.0),
        difficulty: Some(0.0),
    })
}

#[tauri::command]
pub fn srs_get_deck_cards(
    state: State<'_, AppState>,
    deck_id: String,
    page: Option<i64>,
    page_size: Option<i64>,
    search: Option<String>,
    tag: Option<String>,
) -> Result<Vec<CardFull>, String> {
    let conn = lock_db(&state)?;
    let limit = page_size.unwrap_or(50);
    let offset = (page.unwrap_or(1).max(1) - 1) * limit;
    let search = search.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let tag = tag.filter(|t| !t.trim().is_empty());

    let mut stmt = conn
        .prepare(DECK_CARDS_SQL)
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(
            rusqlite::params![deck_id, search, limit, offset, tag],
            map_card,
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let mut cards = Vec::new();
    for row in rows {
        cards.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(cards)
}

/// Total cards in a deck, honouring the same search filter — the deck detail page needs
/// it to render pagination without loading every card.
#[tauri::command]
pub fn srs_count_deck_cards(
    state: State<'_, AppState>,
    deck_id: String,
    search: Option<String>,
    tag: Option<String>,
) -> Result<i64, String> {
    let conn = lock_db(&state)?;
    let search = search.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let tag = tag.filter(|t| !t.trim().is_empty());

    conn.query_row(
        "SELECT COUNT(*) FROM deck_cards dc
         WHERE dc.deck_id = ?1
           AND (?2 IS NULL OR dc.front LIKE '%' || ?2 || '%' OR dc.back LIKE '%' || ?2 || '%')
           AND (?3 IS NULL OR EXISTS (SELECT 1 FROM json_each(dc.tags) WHERE value = ?3))",
        rusqlite::params![deck_id, search, tag],
        |row| row.get(0),
    )
    .map_err(|e| format!("Count error: {e}"))
}

#[tauri::command]
pub fn srs_delete_card(state: State<'_, AppState>, card_id: String) -> Result<(), String> {
    let conn = lock_db(&state)?;

    // Get deck_id before delete for count update
    let deck_id: String = conn
        .query_row(
            "SELECT deck_id FROM deck_cards WHERE id = ?1",
            rusqlite::params![card_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Lookup error: {e}"))?;

    conn.execute(
        "DELETE FROM deck_cards WHERE id = ?1",
        rusqlite::params![card_id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;

    conn.execute(
        "UPDATE decks SET card_count = (SELECT COUNT(*) FROM deck_cards WHERE deck_id = ?1),
                updated_at = datetime('now')
         WHERE id = ?1",
        rusqlite::params![deck_id],
    )
    .map_err(|e| format!("Count update error: {e}"))?;

    Ok(())
}

#[tauri::command]
/// Edit a card.
///
/// This command was previously unreachable from the UI, and broken: it wrote
/// `translation`, `definition` and `updated_at` to `deck_cards`, none of which are
/// columns on that table (`translation`/`definition` live on `vocabulary`; there is no
/// `updated_at` at all), so every call failed with "no such column".
///
/// The card's own fields go to `deck_cards`. Dictionary fields go to the linked
/// `vocabulary` row — and are simply ignored for a card that has none (a cloned card),
/// rather than failing the whole edit.
pub fn srs_update_card(
    state: State<'_, AppState>,
    card_id: String,
    front: Option<String>,
    back: Option<String>,
    notes: Option<String>,
    tags: Option<Vec<String>>,
    translation: Option<String>,
    definition: Option<String>,
) -> Result<(), String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "UPDATE deck_cards SET
             front = COALESCE(?2, front),
             back  = COALESCE(?3, back),
             notes = COALESCE(?4, notes),
             tags  = COALESCE(?5, tags)
         WHERE id = ?1",
        rusqlite::params![card_id, front, back, notes, tags.as_deref().map(dump_tags)],
    )
    .map_err(|e| format!("Update error: {e}"))?;

    if translation.is_some() || definition.is_some() {
        conn.execute(
            "UPDATE vocabulary SET
                 translation = COALESCE(?2, translation),
                 definition  = COALESCE(?3, definition),
                 updated_at  = datetime('now')
             WHERE id = (SELECT vocabulary_id FROM deck_cards WHERE id = ?1)",
            rusqlite::params![card_id, translation, definition],
        )
        .map_err(|e| format!("Update vocabulary error: {e}"))?;
    }

    Ok(())
}

// ── Session Commands ───────────────────────────────────────

#[tauri::command]
pub fn srs_get_due_cards(state: State<'_, AppState>, deck_id: String) -> Result<i64, String> {
    let conn = lock_db(&state)?;
    conn.query_row(
        "SELECT COUNT(*) FROM deck_cards dc
         JOIN srs_progress sp ON sp.card_id = dc.id
         WHERE dc.deck_id = ?1 AND sp.due_date <= datetime('now')",
        rusqlite::params![deck_id],
        |row: &rusqlite::Row| row.get(0),
    )
    .map_err(|e| format!("Query error: {e}"))
}

// ── Merge Command ─────────────────────────────────────────

#[tauri::command]
pub fn srs_merge_decks(
    state: State<'_, AppState>,
    source_deck_id: String,
    target_deck_id: String,
    delete_source: bool,
) -> Result<DeckWithStats, String> {
    let conn = lock_db(&state)?;

    // Get target deck algorithm
    let algorithm: String = conn
        .query_row(
            "SELECT algorithm FROM decks WHERE id = ?1",
            rusqlite::params![target_deck_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Target deck not found: {e}"))?;

    // Move cards from source to target (skip duplicates by vocabulary_id)
    conn.execute(
        "UPDATE deck_cards SET deck_id = ?1
         WHERE deck_id = ?2
         AND (
             (vocabulary_id IS NOT NULL AND vocabulary_id NOT IN (
                 SELECT vocabulary_id FROM deck_cards
                 WHERE deck_id = ?1 AND vocabulary_id IS NOT NULL
             ))
             OR (vocabulary_id IS NULL AND lower(front) NOT IN (
                 SELECT lower(front) FROM deck_cards WHERE deck_id = ?1
             ))
         )",
        rusqlite::params![target_deck_id, source_deck_id],
    )
    .map_err(|e| format!("Merge error: {e}"))?;

    // Update srs_progress algorithm for moved cards
    conn.execute(
        "UPDATE srs_progress SET algorithm = ?1
         WHERE card_id IN (SELECT id FROM deck_cards WHERE deck_id = ?2)",
        rusqlite::params![algorithm, target_deck_id],
    )
    .map_err(|e| format!("Algorithm update error: {e}"))?;

    if delete_source {
        // Delete remaining cards in source (duplicates that weren't moved)
        conn.execute(
            "DELETE FROM deck_cards WHERE deck_id = ?1",
            rusqlite::params![source_deck_id],
        )
        .map_err(|e| format!("Source cards delete error: {e}"))?;

        conn.execute(
            "DELETE FROM decks WHERE id = ?1",
            rusqlite::params![source_deck_id],
        )
        .map_err(|e| format!("Source delete error: {e}"))?;
    }

    // Recount target deck
    conn.execute(
        "UPDATE decks SET card_count = (SELECT COUNT(*) FROM deck_cards WHERE deck_id = ?1),
                updated_at = datetime('now')
         WHERE id = ?1",
        rusqlite::params![target_deck_id],
    )
    .map_err(|e| format!("Count error: {e}"))?;

    // If source not deleted, recount it too
    if !delete_source {
        conn.execute(
            "UPDATE decks SET card_count = (SELECT COUNT(*) FROM deck_cards WHERE deck_id = ?1),
                    updated_at = datetime('now')
             WHERE id = ?1",
            rusqlite::params![source_deck_id],
        )
        .map_err(|e| format!("Source count error: {e}"))?;
    }

    // Return updated target deck
    fetch_deck(&conn, &target_deck_id)
}

// ── Session History & Stats Commands ──────────────────────

#[tauri::command]
pub fn srs_get_deck_stats(
    state: State<'_, AppState>,
    deck_id: String,
) -> Result<serde_json::Value, String> {
    let conn = lock_db(&state)?;

    let algorithm: String = conn
        .query_row(
            "SELECT algorithm FROM decks WHERE id = ?1",
            rusqlite::params![deck_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or_else(|_| "fsrs".to_string());

    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM deck_cards WHERE deck_id = ?1",
            rusqlite::params![deck_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Count error: {e}"))?;

    // Cards with no srs_progress entry = new
    let no_progress: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM deck_cards dc
             LEFT JOIN srs_progress sp ON sp.card_id = dc.id
             WHERE dc.deck_id = ?1 AND sp.id IS NULL",
            rusqlite::params![deck_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or(0);

    // Classify cards with progress into mastered/familiar/learning
    // Matching core backend: Mastered (box>=5), Familiar (box 3-4), Learning (box 1-2)
    let (mastered_count, familiar_count, learning_count) = match algorithm.as_str() {
        "leitner" => {
            let mastered: i64 = conn.query_row(
                "SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id = dc.id
                 WHERE dc.deck_id = ?1 AND sp.box_number >= 5",
                rusqlite::params![deck_id], |row: &rusqlite::Row| row.get(0),
            ).unwrap_or(0);
            let familiar: i64 = conn.query_row(
                "SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id = dc.id
                 WHERE dc.deck_id = ?1 AND sp.box_number >= 3 AND sp.box_number < 5",
                rusqlite::params![deck_id], |row: &rusqlite::Row| row.get(0),
            ).unwrap_or(0);
            let learning: i64 = conn.query_row(
                "SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id = dc.id
                 WHERE dc.deck_id = ?1 AND sp.box_number < 3",
                rusqlite::params![deck_id], |row: &rusqlite::Row| row.get(0),
            ).unwrap_or(0);
            (mastered, familiar, learning)
        }
        "sm2" => {
            let mastered: i64 = conn.query_row(
                "SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id = dc.id
                 WHERE dc.deck_id = ?1 AND sp.interval_days >= 21",
                rusqlite::params![deck_id], |row: &rusqlite::Row| row.get(0),
            ).unwrap_or(0);
            let familiar: i64 = conn.query_row(
                "SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id = dc.id
                 WHERE dc.deck_id = ?1 AND sp.interval_days >= 7 AND sp.interval_days < 21",
                rusqlite::params![deck_id], |row: &rusqlite::Row| row.get(0),
            ).unwrap_or(0);
            let learning: i64 = conn.query_row(
                "SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id = dc.id
                 WHERE dc.deck_id = ?1 AND sp.interval_days < 7",
                rusqlite::params![deck_id], |row: &rusqlite::Row| row.get(0),
            ).unwrap_or(0);
            (mastered, familiar, learning)
        }
        _ => { // FSRS
            let mastered: i64 = conn.query_row(
                "SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id = dc.id
                 WHERE dc.deck_id = ?1 AND sp.stability >= 21",
                rusqlite::params![deck_id], |row: &rusqlite::Row| row.get(0),
            ).unwrap_or(0);
            let familiar: i64 = conn.query_row(
                "SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id = dc.id
                 WHERE dc.deck_id = ?1 AND sp.stability >= 7 AND sp.stability < 21",
                rusqlite::params![deck_id], |row: &rusqlite::Row| row.get(0),
            ).unwrap_or(0);
            let learning: i64 = conn.query_row(
                "SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id = dc.id
                 WHERE dc.deck_id = ?1 AND (sp.stability < 7 OR sp.stability IS NULL)",
                rusqlite::params![deck_id], |row: &rusqlite::Row| row.get(0),
            ).unwrap_or(0);
            (mastered, familiar, learning)
        }
    };

    let new_count = no_progress;

    // Due today: cards with progress where due_date <= now
    let due_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM deck_cards dc
             JOIN srs_progress sp ON sp.card_id = dc.id
             WHERE dc.deck_id = ?1 AND sp.due_date <= datetime('now')",
            rusqlite::params![deck_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or(0);

    // Today's study: due + available new cards
    let total_session_size = due_count + new_count;

    // Active session check
    let active_session = conn
        .query_row(
            "SELECT id, reviewed_cards, total_cards FROM review_sessions
             WHERE deck_id = ?1 AND status = 'in_progress'
             ORDER BY started_at DESC LIMIT 1",
            rusqlite::params![deck_id],
            |row: &rusqlite::Row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "reviewed_cards": row.get::<_, i64>(1)?,
                    "total_cards": row.get::<_, i64>(2)?,
                }))
            },
        )
        .ok();

    Ok(serde_json::json!({
        "deck_progress": {
            "total_cards": total,
            "mastered_count": mastered_count,
            "familiar_count": familiar_count,
            "learning_count": learning_count,
            "new_count": new_count,
        },
        "today_study": {
            "due_count": due_count,
            "new_available": new_count,
            "total_session_size": total_session_size,
        },
        "active_session": active_session,
    }))
}

// ── Vocabulary Commands ────────────────────────────────────

#[tauri::command]
pub fn srs_add_vocabulary(
    state: State<'_, AppState>,
    word: String,
    language: String,
    translation: Option<String>,
    definition: Option<String>,
    pos: Option<String>,
    cefr_level: Option<String>,
    example_sentence: Option<String>,
    source_module: String,
    context_sentence: Option<String>,
) -> Result<i64, String> {
    let conn = lock_db(&state)?;

    // Check if exists
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM vocabulary WHERE word = ?1 AND language = ?2",
            rusqlite::params![word, language],
            |row: &rusqlite::Row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        // Update if new info provided
        if translation.is_some() || definition.is_some() {
            conn.execute(
                "UPDATE vocabulary SET
                    translation = COALESCE(?1, translation),
                    definition = COALESCE(?2, definition),
                    pos = COALESCE(?3, pos),
                    cefr_level = COALESCE(?4, cefr_level),
                    examples = COALESCE(?5, examples),
                    updated_at = datetime('now')
                 WHERE id = ?6",
                rusqlite::params![translation, definition, pos, cefr_level, example_sentence, id],
            )
            .map_err(|e| format!("Vocab update error: {e}"))?;
        }
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO vocabulary (word, language, translation, definition, pos, cefr_level, examples, source_module, context_sentence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![word, language, translation, definition, pos, cefr_level, example_sentence, source_module, context_sentence],
        )
        .map_err(|e| format!("Vocab insert error: {e}"))?;

        Ok(conn.last_insert_rowid())
    }
}

// ── Tags, history and list-level stats ────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TagCount {
    pub tag: String,
    pub count: i64,
}

/// Every tag used by a deck's cards, most used first — the card tag filter's options
/// (the website's `get-available-card-tags`).
pub(crate) fn deck_card_tags(conn: &rusqlite::Connection, deck_id: &str) -> Result<Vec<TagCount>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT j.value, COUNT(*) AS n
             FROM deck_cards dc, json_each(dc.tags) j
             WHERE dc.deck_id = ?1 AND TRIM(j.value) != ''
             GROUP BY j.value
             ORDER BY n DESC, j.value ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params![deck_id], |row| {
            Ok(TagCount { tag: row.get(0)?, count: row.get(1)? })
        })
        .map_err(|e| format!("Query error: {e}"))?;
    rows.map(|r| r.map_err(|e| format!("Row error: {e}"))).collect()
}

#[tauri::command]
pub fn srs_deck_card_tags(state: State<'_, AppState>, deck_id: String) -> Result<Vec<TagCount>, String> {
    let conn = lock_db(&state)?;
    deck_card_tags(&conn, &deck_id)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeckSession {
    pub id: String,
    /// `completed`, `active` or `abandoned`.
    pub status: String,
    pub started_at: String,
    pub completed: i64,
    pub total: i64,
    pub correct: i64,
    pub seconds: i64,
}

/// Past study sessions that touched this deck, newest first. Both the Study module's
/// sessions (`pr_session`, matched by the deck ids it was started with) and the older
/// review runner's (`review_sessions`).
pub(crate) fn deck_sessions(conn: &rusqlite::Connection, deck_id: &str, limit: i64) -> Result<Vec<DeckSession>, String> {
    let mut stmt = conn
        .prepare(
            r#"SELECT id, status, started_at, completed, total, correct, seconds FROM (
                 SELECT id,
                        CASE status WHEN 'in_progress' THEN 'active' ELSE status END AS status,
                        started_at,
                        reviewed_cards AS completed, total_cards AS total,
                        correct_count AS correct, COALESCE(duration_seconds, 0) AS seconds
                 FROM review_sessions WHERE deck_id = ?1
                 UNION ALL
                 SELECT id, status, started_at,
                        activities_total AS completed,
                        MAX(activities_total, COALESCE(json_array_length(card_queue), 0)) AS total,
                        activities_correct AS correct, COALESCE(total_seconds, 0) AS seconds
                 FROM pr_session
                 WHERE deck_ids LIKE '%"' || ?1 || '"%' AND activities_total > 0
             )
             ORDER BY started_at DESC LIMIT ?2"#,
        )
        .map_err(|e| format!("Query error: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params![deck_id, limit], |row| {
            Ok(DeckSession {
                id: row.get(0)?,
                status: row.get(1)?,
                started_at: row.get(2)?,
                completed: row.get(3)?,
                total: row.get(4)?,
                correct: row.get(5)?,
                seconds: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;
    rows.map(|r| r.map_err(|e| format!("Row error: {e}"))).collect()
}

#[tauri::command]
pub fn srs_deck_history(
    state: State<'_, AppState>,
    deck_id: String,
    limit: Option<i64>,
) -> Result<Vec<DeckSession>, String> {
    let conn = lock_db(&state)?;
    deck_sessions(&conn, &deck_id, limit.unwrap_or(50).clamp(1, 200))
}

/// The four numbers above the decks list.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DecksOverview {
    pub total_reviewed: i64,
    pub total_mastered: i64,
    /// Share of correct answers over the last 7 days, 0–100, one decimal.
    pub rolling_accuracy: f64,
    pub current_streak: i64,
    pub longest_streak: i64,
}

pub(crate) fn decks_overview(conn: &rusqlite::Connection) -> Result<DecksOverview, String> {
    let total_reviewed: i64 = conn
        .query_row("SELECT COALESCE(SUM(review_count), 0) FROM srs_progress", [], |r| r.get(0))
        .map_err(|e| format!("Query error: {e}"))?;
    let total_mastered: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM srs_progress WHERE state = 'review' AND interval_days >= 7",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("Query error: {e}"))?;

    // Study answers first; the older runner's ratings only when there are none.
    let (answered, correct): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(is_correct), 0) FROM pr_activity
             WHERE is_correct IS NOT NULL AND created_at >= datetime('now', '-7 days')",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| format!("Query error: {e}"))?;
    let (answered, correct) = if answered > 0 {
        (answered, correct)
    } else {
        conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(rating != 'again'), 0) FROM review_logs
             WHERE created_at >= datetime('now', '-7 days')",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| format!("Query error: {e}"))?
    };
    let rolling_accuracy = if answered > 0 {
        ((correct as f64 / answered as f64) * 1000.0).round() / 10.0
    } else {
        0.0
    };

    let (current_streak, longest_streak): (i64, i64) = conn
        .query_row(
            "SELECT COALESCE(current_streak, 0), COALESCE(longest_streak, 0) FROM streaks ORDER BY rowid LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((0, 0));

    Ok(DecksOverview { total_reviewed, total_mastered, rolling_accuracy, current_streak, longest_streak })
}

#[tauri::command]
pub fn srs_decks_overview(state: State<'_, AppState>) -> Result<DecksOverview, String> {
    let conn = lock_db(&state)?;
    decks_overview(&conn)
}

#[cfg(test)]
mod cloned_card_visibility_tests {
    use crate::commands::deck_cloud::snapshot;
    use crate::commands::deck_hub::QUIZLET_EXPORT_SQL;
    use crate::commands::srs::DECK_CARDS_SQL;
    use crate::db::schema::run_migrations;
    use crate::export::anki::DECK_EXPORT_SQL;
    use rusqlite::Connection;

    /// Migration V032 made `deck_cards.vocabulary_id` nullable so a deck can hold cards
    /// that aren't dictionary words: cloned public decks, grammar cards, sentences.
    ///
    /// Four queries used to `JOIN vocabulary` on that column. An inner join makes every
    /// such card **silently invisible** — absent from its own deck, absent from every
    /// export — with no error anywhere. This test holds all four to a LEFT JOIN.
    fn deck_with_one_word_card_and_one_cloned_card() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO decks (id, name, language) VALUES ('d1', 'Deck', 'en')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO vocabulary (id, word, language, translation)
             VALUES (1, 'hello', 'en', 'salam')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back, order_index)
             VALUES ('c1', 'd1', 1, 'hello', 'salam', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back, order_index)
             VALUES ('c2', 'd1', NULL, 'cloned front', 'cloned back', 1)",
            [],
        )
        .unwrap();
        conn
    }

    fn count(conn: &Connection, sql: &str, params: &[&dyn rusqlite::ToSql]) -> i64 {
        let mut stmt = conn.prepare(sql).expect("sql prepares");
        let mut rows = stmt.query(params).expect("sql runs");
        let mut n = 0;
        while rows.next().unwrap().is_some() {
            n += 1;
        }
        n
    }

    #[test]
    fn deck_card_list_shows_cloned_cards() {
        let conn = deck_with_one_word_card_and_one_cloned_card();
        let none: Option<String> = None;
        let n = count(&conn, DECK_CARDS_SQL, rusqlite::params![&"d1", &none, &50i64, &0i64, &none]);
        assert_eq!(n, 2, "a cloned card must appear in its own deck");
    }

    /// With no vocabulary row there is no `word`; the card's own front text stands in.
    #[test]
    fn deck_card_list_falls_back_to_front_text_for_the_word() {
        let conn = deck_with_one_word_card_and_one_cloned_card();
        let mut stmt = conn.prepare(DECK_CARDS_SQL).unwrap();
        let none: Option<String> = None;
        let words: Vec<String> = stmt
            .query_map(rusqlite::params![&"d1", &none, &50i64, &0i64, &none], |r| {
                r.get::<_, String>("word")
            })
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(words, vec!["hello", "cloned front"]);
    }

    #[test]
    fn search_filters_on_the_cards_own_text() {
        let conn = deck_with_one_word_card_and_one_cloned_card();
        let n = count(
            &conn,
            DECK_CARDS_SQL,
            rusqlite::params![&"d1", &Some("cloned"), &50i64, &0i64, &None::<String>],
        );
        assert_eq!(n, 1, "search matches a card with no vocabulary row");
    }

    #[test]
    fn anki_export_includes_cloned_cards() {
        let conn = deck_with_one_word_card_and_one_cloned_card();
        assert_eq!(count(&conn, DECK_EXPORT_SQL, rusqlite::params![&"d1"]), 2);

        // The NULL word must not blow up the String mapping.
        let mut stmt = conn.prepare(DECK_EXPORT_SQL).unwrap();
        let words: Vec<String> = stmt
            .query_map(rusqlite::params![&"d1"], |r| r.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(words, vec!["hello", "cloned front"]);
    }

    #[test]
    fn quizlet_and_cloud_push_include_cloned_cards() {
        let conn = deck_with_one_word_card_and_one_cloned_card();
        assert_eq!(count(&conn, QUIZLET_EXPORT_SQL, rusqlite::params![&"d1"]), 2);
        assert_eq!(snapshot(&conn, "d1").unwrap().cards.len(), 2);
    }
}

#[cfg(test)]
mod deck_page_queries_tests {
    use super::*;
    use crate::db::schema::run_migrations;
    use rusqlite::Connection;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO decks (id, name, language, native_language, tags, is_public) VALUES ('d1', 'Deck', 'fr', 'en', '[\"x\",\"y\"]', 1)", [])
            .unwrap();
        for (id, front, tags) in [
            ("c1", "un", r#"["verbs","travel"]"#),
            ("c2", "deux", r#"["verbs"]"#),
            ("c3", "trois", "[]"),
        ] {
            conn.execute(
                "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back, tags, order_index) VALUES (?1, 'd1', NULL, ?2, 'b', ?3, 0)",
                rusqlite::params![id, front, tags],
            )
            .unwrap();
        }
        conn
    }

    #[test]
    fn deck_carries_its_pair_tags_and_public_flag() {
        let conn = db();
        let d = fetch_deck(&conn, "d1").unwrap();
        assert_eq!((d.language.as_str(), d.native_language.as_deref()), ("fr", Some("en")));
        assert_eq!(d.tags, vec!["x", "y"]);
        assert!(d.is_public && !d.source_public);
        assert_eq!(d.total_clones, 0);
    }

    #[test]
    fn card_tags_are_counted_most_used_first() {
        let conn = db();
        let tags = deck_card_tags(&conn, "d1").unwrap();
        assert_eq!(
            tags,
            vec![
                TagCount { tag: "verbs".into(), count: 2 },
                TagCount { tag: "travel".into(), count: 1 }
            ]
        );
    }

    #[test]
    fn tag_filter_narrows_the_card_list() {
        let conn = db();
        let mut stmt = conn.prepare(DECK_CARDS_SQL).unwrap();
        let none: Option<String> = None;
        let mut n = |tag: Option<&str>| {
            stmt.query_map(rusqlite::params![&"d1", &none, &50i64, &0i64, &tag], |r| r.get::<_, String>(0))
                .unwrap()
                .count()
        };
        assert_eq!(n(None), 3);
        assert_eq!(n(Some("verbs")), 2);
        assert_eq!(n(Some("travel")), 1);
        assert_eq!(n(Some("missing")), 0);
    }

    #[test]
    fn history_lists_both_runners_newest_first() {
        let conn = db();
        conn.execute(
            "INSERT INTO review_sessions (id, deck_id, algorithm, status, total_cards, reviewed_cards, correct_count, started_at)
             VALUES ('old', 'd1', 'fsrs', 'completed', 10, 10, 8, '2026-01-01 10:00:00')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO pr_session (id, deck_ids, started_at, status, activities_total, activities_correct, card_queue, total_seconds)
             VALUES ('new', '[\"d1\",\"other\"]', '2026-02-01 10:00:00', 'completed', 4, 3, '[1,2,3,4,5,6]', 90),
                    ('elsewhere', '[\"other\"]', '2026-03-01 10:00:00', 'completed', 4, 3, '[]', 10),
                    ('empty', '[\"d1\"]', '2026-04-01 10:00:00', 'abandoned', 0, 0, '[]', 0)",
            [],
        )
        .unwrap();
        let h = deck_sessions(&conn, "d1", 50).unwrap();
        let ids: Vec<&str> = h.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["new", "old"], "other decks' and zero-answer sessions are left out");
        assert_eq!((h[0].completed, h[0].total, h[0].correct, h[0].seconds), (4, 6, 3, 90));
        assert_eq!(h[1].status, "completed");
    }

    #[test]
    fn overview_reports_mastery_accuracy_and_streaks() {
        let conn = db();
        conn.execute("INSERT INTO srs_progress (id, card_id, algorithm, state, interval_days, review_count) VALUES ('p1', 'c1', 'fsrs', 'review', 10, 4)", []).unwrap();
        conn.execute("INSERT INTO srs_progress (id, card_id, algorithm, state, interval_days, review_count) VALUES ('p2', 'c2', 'fsrs', 'learning', 1, 2)", []).unwrap();
        conn.execute("INSERT INTO streaks (current_streak, longest_streak) VALUES (3, 9)", []).unwrap();
        conn.execute("INSERT INTO pr_session (id) VALUES ('s')", []).unwrap();
        for (i, ok) in [(1, 1), (2, 1), (3, 0), (4, 1)] {
            conn.execute(
                "INSERT INTO pr_activity (id, session_id, activity_type, is_correct) VALUES (?1, 's', 'recall', ?2)",
                rusqlite::params![format!("a{i}"), ok],
            )
            .unwrap();
        }
        let o = decks_overview(&conn).unwrap();
        assert_eq!((o.total_reviewed, o.total_mastered), (6, 1));
        assert_eq!(o.rolling_accuracy, 75.0);
        assert_eq!((o.current_streak, o.longest_streak), (3, 9));
    }

    #[test]
    fn overview_of_an_empty_library_is_zeroes() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let o = decks_overview(&conn).unwrap();
        assert_eq!((o.total_reviewed, o.total_mastered, o.rolling_accuracy), (0, 0, 0.0));
    }
}
