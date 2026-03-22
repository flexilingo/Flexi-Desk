use serde::{Deserialize, Serialize};
use tauri::State;

use crate::srs::strategy::create_strategy;
use crate::srs::types::*;
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
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardFull {
    pub id: String,
    pub deck_id: String,
    pub vocabulary_id: i64,
    pub front: String,
    pub back: String,
    pub notes: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSessionData {
    pub id: String,
    pub deck_id: Option<String>,
    pub algorithm: String,
    pub status: String,
    pub total_cards: i64,
    pub reviewed_cards: i64,
    pub correct_count: i64,
    pub card_ids: Vec<String>,
    pub current_index: i64,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub total_cards: i64,
    pub reviewed_cards: i64,
    pub correct_count: i64,
    pub again_count: i64,
    pub hard_count: i64,
    pub good_count: i64,
    pub easy_count: i64,
    pub accuracy: f64,
    pub duration_seconds: i64,
}

// ── Helper ─────────────────────────────────────────────────

fn lock_db<'a>(state: &'a State<'a, AppState>) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

// ── Deck Commands ──────────────────────────────────────────

#[tauri::command]
pub fn srs_list_decks(state: State<'_, AppState>) -> Result<Vec<DeckWithStats>, String> {
    let conn = lock_db(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.name, d.description, d.language, d.algorithm,
                    d.card_count, d.created_at, d.updated_at,
                    (SELECT COUNT(*) FROM deck_cards dc
                     JOIN srs_progress sp ON sp.card_id = dc.id
                     WHERE dc.deck_id = d.id AND sp.due_date <= datetime('now')) AS due_today,
                    (SELECT COUNT(*) FROM deck_cards dc
                     JOIN srs_progress sp ON sp.card_id = dc.id
                     WHERE dc.deck_id = d.id AND sp.state = 'new') AS new_cards
             FROM decks d
             ORDER BY d.updated_at DESC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map([], |row: &rusqlite::Row| {
            Ok(DeckWithStats {
                id: row.get::<_, String>(0)?,
                name: row.get::<_, String>(1)?,
                description: row.get::<_, Option<String>>(2)?,
                language: row.get::<_, String>(3)?,
                algorithm: row.get::<_, String>(4)?,
                card_count: row.get::<_, i64>(5)?,
                created_at: row.get::<_, String>(6)?,
                updated_at: row.get::<_, String>(7)?,
                due_today: row.get::<_, i64>(8)?,
                new_cards: row.get::<_, i64>(9)?,
            })
        })
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
) -> Result<DeckWithStats, String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "INSERT INTO decks (id, name, description, language, algorithm)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4)",
        rusqlite::params![name, description, language, algorithm],
    )
    .map_err(|e| format!("Insert error: {e}"))?;

    // Get the actual inserted row by name (last inserted)
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, language, algorithm, card_count, created_at, updated_at
             FROM decks WHERE name = ?1 AND language = ?2 ORDER BY created_at DESC LIMIT 1",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let deck = stmt
        .query_row(rusqlite::params![name, language], |row: &rusqlite::Row| {
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
                new_cards: 0,
            })
        })
        .map_err(|e| format!("Fetch error: {e}"))?;

    Ok(deck)
}

#[tauri::command]
pub fn srs_update_deck(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    algorithm: Option<String>,
) -> Result<DeckWithStats, String> {
    let conn = lock_db(&state)?;

    if let Some(ref n) = name {
        conn.execute(
            "UPDATE decks SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![n, id],
        )
        .map_err(|e| format!("Update error: {e}"))?;
    }
    if let Some(ref d) = description {
        conn.execute(
            "UPDATE decks SET description = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![d, id],
        )
        .map_err(|e| format!("Update error: {e}"))?;
    }
    if let Some(ref a) = algorithm {
        conn.execute(
            "UPDATE decks SET algorithm = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![a, id],
        )
        .map_err(|e| format!("Update error: {e}"))?;
    }

    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.name, d.description, d.language, d.algorithm,
                    d.card_count, d.created_at, d.updated_at,
                    (SELECT COUNT(*) FROM deck_cards dc
                     JOIN srs_progress sp ON sp.card_id = dc.id
                     WHERE dc.deck_id = d.id AND sp.due_date <= datetime('now')) AS due_today,
                    (SELECT COUNT(*) FROM deck_cards dc
                     JOIN srs_progress sp ON sp.card_id = dc.id
                     WHERE dc.deck_id = d.id AND sp.state = 'new') AS new_cards
             FROM decks d WHERE d.id = ?1",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    stmt.query_row(rusqlite::params![id], |row: &rusqlite::Row| {
        Ok(DeckWithStats {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            language: row.get(3)?,
            algorithm: row.get(4)?,
            card_count: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            due_today: row.get(8)?,
            new_cards: row.get(9)?,
        })
    })
    .map_err(|e| format!("Fetch error: {e}"))
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
) -> Result<CardFull, String> {
    let conn = lock_db(&state)?;

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

    // Insert deck_card
    conn.execute(
        "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back, notes)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![deck_id, vocab_id, front, back, notes],
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
        vocabulary_id: vocab_id,
        front,
        back,
        notes,
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
) -> Result<Vec<CardFull>, String> {
    let conn = lock_db(&state)?;
    let limit = page_size.unwrap_or(50);
    let offset = (page.unwrap_or(1) - 1) * limit;

    let mut stmt = conn
        .prepare(
            "SELECT dc.id, dc.deck_id, dc.vocabulary_id, dc.front, dc.back, dc.notes,
                    v.word, v.language, v.translation, v.definition, v.pos, v.cefr_level, v.examples,
                    sp.state, sp.interval_days, sp.due_date, sp.review_count,
                    sp.box_number, sp.easiness_factor, sp.stability, sp.difficulty
             FROM deck_cards dc
             JOIN vocabulary v ON v.id = dc.vocabulary_id
             LEFT JOIN srs_progress sp ON sp.card_id = dc.id
             WHERE dc.deck_id = ?1
             ORDER BY dc.added_at DESC
             LIMIT ?2 OFFSET ?3",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![deck_id, limit, offset], |row: &rusqlite::Row| {
            Ok(CardFull {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                vocabulary_id: row.get(2)?,
                front: row.get(3)?,
                back: row.get(4)?,
                notes: row.get(5)?,
                word: row.get(6)?,
                language: row.get(7)?,
                translation: row.get(8)?,
                definition: row.get(9)?,
                pos: row.get(10)?,
                cefr_level: row.get(11)?,
                example_sentence: row.get(12)?,
                state: row.get::<_, Option<String>>(13)?.unwrap_or_else(|| "new".to_string()),
                interval_days: row.get::<_, Option<f64>>(14)?.unwrap_or(0.0),
                due_date: row.get::<_, Option<String>>(15)?.unwrap_or_default(),
                review_count: row.get::<_, Option<i64>>(16)?.unwrap_or(0),
                box_number: row.get(17)?,
                easiness_factor: row.get(18)?,
                stability: row.get(19)?,
                difficulty: row.get(20)?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut cards = Vec::new();
    for row in rows {
        cards.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(cards)
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
pub fn srs_update_card(
    state: State<'_, AppState>,
    card_id: String,
    front: Option<String>,
    translation: Option<String>,
    definition: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    let conn = lock_db(&state)?;

    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref v) = front {
        updates.push("front = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(ref v) = translation {
        updates.push("translation = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(ref v) = definition {
        updates.push("definition = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(ref v) = notes {
        updates.push("notes = ?");
        params.push(Box::new(v.clone()));
    }

    if updates.is_empty() {
        return Ok(());
    }

    updates.push("updated_at = datetime('now')");
    let sql = format!(
        "UPDATE deck_cards SET {} WHERE id = ?",
        updates.join(", ")
    );
    params.push(Box::new(card_id));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| format!("Update error: {e}"))?;

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

#[tauri::command]
pub fn srs_start_session(
    state: State<'_, AppState>,
    deck_id: String,
    limit: Option<i64>,
) -> Result<ReviewSessionData, String> {
    let conn = lock_db(&state)?;

    let (algorithm, deck_name): (String, String) = conn
        .query_row(
            "SELECT algorithm, name FROM decks WHERE id = ?1",
            rusqlite::params![deck_id],
            |row: &rusqlite::Row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Deck lookup error: {e}"))?;

    let card_limit = limit.unwrap_or(200);

    // Fetch ALL cards with priority: 1) due (overdue), 2) new (no progress), 3) not-yet-due
    // Matches front-end's create-review-session-service.ts logic
    let mut stmt = conn
        .prepare(
            "SELECT dc.id FROM deck_cards dc
             LEFT JOIN srs_progress sp ON sp.card_id = dc.id
             WHERE dc.deck_id = ?1
             ORDER BY
               CASE
                 WHEN sp.id IS NOT NULL AND sp.due_date <= datetime('now') THEN 0
                 WHEN sp.id IS NULL THEN 1
                 ELSE 2
               END,
               sp.due_date ASC
             LIMIT ?2",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let card_ids: Vec<String> = stmt
        .query_map(rusqlite::params![deck_id, card_limit], |row: &rusqlite::Row| row.get(0))
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let total = card_ids.len() as i64;
    let card_ids_json = serde_json::to_string(&card_ids).unwrap_or_else(|_| "[]".to_string());

    // Create session
    conn.execute(
        "INSERT INTO review_sessions (id, deck_id, algorithm, total_cards, card_ids, session_name)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![deck_id, algorithm, total, card_ids_json, deck_name],
    )
    .map_err(|e| format!("Session insert error: {e}"))?;

    let session_id: String = conn
        .query_row(
            "SELECT id FROM review_sessions WHERE deck_id = ?1 AND status = 'in_progress'
             ORDER BY started_at DESC LIMIT 1",
            rusqlite::params![deck_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?;

    let started_at: String = conn
        .query_row(
            "SELECT started_at FROM review_sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?;

    Ok(ReviewSessionData {
        id: session_id,
        deck_id: Some(deck_id),
        algorithm,
        status: "in_progress".to_string(),
        total_cards: total,
        reviewed_cards: 0,
        correct_count: 0,
        card_ids,
        current_index: 0,
        started_at,
        completed_at: None,
        duration_seconds: 0,
    })
}

#[tauri::command]
pub fn srs_start_multi_deck_session(
    state: State<'_, AppState>,
    deck_ids: Vec<String>,
    limit: Option<i64>,
) -> Result<ReviewSessionData, String> {
    let conn = lock_db(&state)?;

    if deck_ids.is_empty() {
        return Err("No decks selected".to_string());
    }

    // Use the algorithm from the first deck
    let algorithm: String = conn
        .query_row(
            "SELECT algorithm FROM decks WHERE id = ?1",
            rusqlite::params![deck_ids[0]],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Deck lookup error: {e}"))?;

    // Build session name from deck names
    let mut deck_names: Vec<String> = Vec::new();
    for did in &deck_ids {
        if let Ok(name) = conn.query_row(
            "SELECT name FROM decks WHERE id = ?1",
            rusqlite::params![did],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        ) {
            deck_names.push(name);
        }
    }
    let session_name = if deck_names.len() == 1 {
        deck_names[0].clone()
    } else {
        deck_names.join(" + ")
    };

    let card_limit = limit.unwrap_or(200);

    // Fetch ALL cards with priority: 1) due, 2) new, 3) not-yet-due
    let placeholders: Vec<String> = deck_ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
    let in_clause = placeholders.join(", ");
    let sql = format!(
        "SELECT dc.id FROM deck_cards dc
         LEFT JOIN srs_progress sp ON sp.card_id = dc.id
         WHERE dc.deck_id IN ({in_clause})
         ORDER BY
           CASE
             WHEN sp.id IS NOT NULL AND sp.due_date <= datetime('now') THEN 0
             WHEN sp.id IS NULL THEN 1
             ELSE 2
           END,
           sp.due_date ASC
         LIMIT ?{}",
        deck_ids.len() + 1
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {e}"))?;

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = deck_ids.iter().map(|id| Box::new(id.clone()) as Box<dyn rusqlite::types::ToSql>).collect();
    params.push(Box::new(card_limit));
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let all_card_ids: Vec<String> = stmt
        .query_map(param_refs.as_slice(), |row: &rusqlite::Row| row.get(0))
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let total = all_card_ids.len() as i64;
    let card_ids_json = serde_json::to_string(&all_card_ids).unwrap_or_else(|_| "[]".to_string());

    // Create session (deck_id = NULL for multi-deck)
    let session_id = uuid::Uuid::new_v4().to_string().replace('-', "");
    conn.execute(
        "INSERT INTO review_sessions (id, deck_id, algorithm, total_cards, card_ids, session_name)
         VALUES (?1, NULL, ?2, ?3, ?4, ?5)",
        rusqlite::params![session_id, algorithm, total, card_ids_json, session_name],
    )
    .map_err(|e| format!("Session insert error: {e}"))?;

    let started_at: String = conn
        .query_row(
            "SELECT started_at FROM review_sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?;

    Ok(ReviewSessionData {
        id: session_id,
        deck_id: None,
        algorithm,
        status: "in_progress".to_string(),
        total_cards: total,
        reviewed_cards: 0,
        correct_count: 0,
        card_ids: all_card_ids,
        current_index: 0,
        started_at,
        completed_at: None,
        duration_seconds: 0,
    })
}

#[tauri::command]
pub fn srs_get_session_card(
    state: State<'_, AppState>,
    session_id: String,
    index: i64,
) -> Result<CardFull, String> {
    let conn = lock_db(&state)?;

    let card_ids_json: String = conn
        .query_row(
            "SELECT card_ids FROM review_sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?;

    let card_ids: Vec<String> =
        serde_json::from_str(&card_ids_json).map_err(|e| format!("JSON parse error: {e}"))?;

    let card_id = card_ids
        .get(index as usize)
        .ok_or_else(|| "Card index out of bounds".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT dc.id, dc.deck_id, dc.vocabulary_id, dc.front, dc.back, dc.notes,
                    v.word, v.language, v.translation, v.definition, v.pos, v.cefr_level, v.examples,
                    sp.state, sp.interval_days, sp.due_date, sp.review_count,
                    sp.box_number, sp.easiness_factor, sp.stability, sp.difficulty
             FROM deck_cards dc
             JOIN vocabulary v ON v.id = dc.vocabulary_id
             LEFT JOIN srs_progress sp ON sp.card_id = dc.id
             WHERE dc.id = ?1",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    stmt.query_row(rusqlite::params![card_id], |row: &rusqlite::Row| {
        Ok(CardFull {
            id: row.get(0)?,
            deck_id: row.get(1)?,
            vocabulary_id: row.get(2)?,
            front: row.get(3)?,
            back: row.get(4)?,
            notes: row.get(5)?,
            word: row.get(6)?,
            language: row.get(7)?,
            translation: row.get(8)?,
            definition: row.get(9)?,
            pos: row.get(10)?,
            cefr_level: row.get(11)?,
            example_sentence: row.get(12)?,
            state: row.get::<_, Option<String>>(13)?.unwrap_or_else(|| "new".to_string()),
            interval_days: row.get::<_, Option<f64>>(14)?.unwrap_or(0.0),
            due_date: row.get::<_, Option<String>>(15)?.unwrap_or_default(),
            review_count: row.get::<_, Option<i64>>(16)?.unwrap_or(0),
            box_number: row.get(17)?,
            easiness_factor: row.get(18)?,
            stability: row.get(19)?,
            difficulty: row.get(20)?,
        })
    })
    .map_err(|e| format!("Card lookup error: {e}"))
}

#[tauri::command]
pub fn srs_rate_card(
    state: State<'_, AppState>,
    session_id: String,
    card_id: String,
    rating: String,
    time_spent_ms: Option<i64>,
) -> Result<ScheduleResult, String> {
    let conn = lock_db(&state)?;

    let rating = Rating::from_str(&rating)?;

    // Get deck algorithm for this card
    let deck_algorithm: String = conn
        .query_row(
            "SELECT d.algorithm FROM deck_cards dc
             JOIN decks d ON d.id = dc.deck_id
             WHERE dc.id = ?1",
            rusqlite::params![card_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or_else(|_| "fsrs".to_string());

    // Create srs_progress entry if it doesn't exist (new card)
    conn.execute(
        "INSERT OR IGNORE INTO srs_progress (id, card_id, algorithm, state, interval_days, due_date)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, 'new', 0, datetime('now'))",
        rusqlite::params![card_id, deck_algorithm],
    )
    .map_err(|e| format!("Progress init error: {e}"))?;

    // Read current progress
    let (algorithm_str, box_number, ef, reps, stability, difficulty, state_str, interval, due_str, last_rev, review_count, lapses): (
        String, Option<i32>, Option<f64>, Option<i32>, Option<f64>, Option<f64>, String, f64, String, Option<String>, i32, i32,
    ) = conn
        .query_row(
            "SELECT algorithm, box_number, easiness_factor, repetitions,
                    stability, difficulty, state, interval_days, due_date,
                    last_review, review_count, lapses
             FROM srs_progress WHERE card_id = ?1",
            rusqlite::params![card_id],
            |row: &rusqlite::Row| {
                Ok((
                    row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                    row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?,
                    row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?,
                ))
            },
        )
        .map_err(|e| format!("Progress lookup error: {e}"))?;

    let algorithm = Algorithm::from_str(&algorithm_str)?;
    let card_state = CardState::from_str(&state_str)?;

    let last_review = last_rev.and_then(|s| {
        chrono::DateTime::parse_from_rfc3339(&s)
            .ok()
            .map(|dt| dt.with_timezone(&chrono::Utc))
    });
    let due_date = chrono::DateTime::parse_from_rfc3339(&due_str)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now());

    let progress = CardProgress {
        card_id: card_id.clone(),
        algorithm,
        box_number,
        easiness_factor: ef,
        repetitions: reps,
        stability,
        difficulty,
        state: card_state,
        interval_days: interval,
        due_date,
        last_review,
        review_count,
        lapses,
    };

    // Run algorithm
    let strategy = create_strategy(algorithm);
    let result = strategy.schedule(&progress, rating);

    // Update srs_progress
    let algo_state = &result.algorithm_state;
    let new_box = algo_state.get("box_number").and_then(|v| v.as_i64());
    let new_ef = algo_state.get("easiness_factor").and_then(|v| v.as_f64());
    let new_reps = algo_state.get("repetitions").and_then(|v| v.as_i64()).map(|v| v as i32);
    let new_stability = algo_state.get("stability").and_then(|v| v.as_f64());
    let new_difficulty = algo_state.get("difficulty").and_then(|v| v.as_f64());

    let new_lapses = if rating == Rating::Again {
        lapses + 1
    } else {
        lapses
    };

    conn.execute(
        "UPDATE srs_progress SET
            state = ?1, interval_days = ?2, due_date = ?3,
            last_review = datetime('now'), review_count = review_count + 1,
            lapses = ?4, box_number = ?5, easiness_factor = ?6,
            repetitions = ?7, stability = ?8, difficulty = ?9,
            updated_at = datetime('now')
         WHERE card_id = ?10",
        rusqlite::params![
            result.state,
            result.interval_days,
            result.due_date,
            new_lapses,
            new_box,
            new_ef,
            new_reps,
            new_stability,
            new_difficulty,
            card_id,
        ],
    )
    .map_err(|e| format!("Progress update error: {e}"))?;

    // Log to review_logs
    let rating_str = match rating {
        Rating::Again => "again",
        Rating::Hard => "hard",
        Rating::Good => "good",
        Rating::Easy => "easy",
    };

    conn.execute(
        "INSERT INTO review_logs (id, session_id, card_id, rating, interval_before, interval_after, state_before, state_after, time_spent_ms)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            session_id,
            card_id,
            rating_str,
            interval,
            result.interval_days,
            state_str,
            result.state,
            time_spent_ms.unwrap_or(0),
        ],
    )
    .map_err(|e| format!("Review log error: {e}"))?;

    // Update session counters (algorithm determines correctness)
    let is_correct = result.was_correct;
    if is_correct {
        conn.execute(
            "UPDATE review_sessions SET
                reviewed_cards = reviewed_cards + 1,
                correct_count = correct_count + 1,
                current_index = current_index + 1
             WHERE id = ?1",
            rusqlite::params![session_id],
        )
        .map_err(|e| format!("Session update error: {e}"))?;
    } else {
        conn.execute(
            "UPDATE review_sessions SET
                reviewed_cards = reviewed_cards + 1,
                current_index = current_index + 1
             WHERE id = ?1",
            rusqlite::params![session_id],
        )
        .map_err(|e| format!("Session update error: {e}"))?;
    }

    Ok(result)
}

#[tauri::command]
pub fn srs_complete_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionSummary, String> {
    let conn = lock_db(&state)?;

    // Calculate duration
    conn.execute(
        "UPDATE review_sessions SET
            status = 'completed',
            completed_at = datetime('now'),
            duration_seconds = CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER)
         WHERE id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| format!("Session complete error: {e}"))?;

    let (total, reviewed, correct, duration): (i64, i64, i64, i64) = conn
        .query_row(
            "SELECT total_cards, reviewed_cards, correct_count, duration_seconds
             FROM review_sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row: &rusqlite::Row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Session lookup error: {e}"))?;

    // Query review_logs for per-rating counts
    let (again_count, hard_count, good_count, easy_count): (i64, i64, i64, i64) = conn
        .query_row(
            "SELECT
                COALESCE(SUM(CASE WHEN rating = 'again' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN rating = 'hard' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN rating = 'easy' THEN 1 ELSE 0 END), 0)
             FROM review_logs WHERE session_id = ?1",
            rusqlite::params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap_or((0, 0, 0, 0));

    let accuracy = if reviewed > 0 {
        correct as f64 / reviewed as f64
    } else {
        0.0
    };

    Ok(SessionSummary {
        total_cards: total,
        reviewed_cards: reviewed,
        correct_count: correct,
        again_count,
        hard_count,
        good_count,
        easy_count,
        accuracy,
        duration_seconds: duration,
    })
}

#[tauri::command]
pub fn srs_get_incomplete_session(
    state: State<'_, AppState>,
) -> Result<Option<ReviewSessionData>, String> {
    let conn = lock_db(&state)?;

    let result = conn.query_row(
        "SELECT id, deck_id, algorithm, status, total_cards, reviewed_cards,
                correct_count, card_ids, current_index, started_at, completed_at, duration_seconds
         FROM review_sessions WHERE status = 'in_progress'
         ORDER BY started_at DESC LIMIT 1",
        [],
        |row: &rusqlite::Row| {
            let card_ids_json: String = row.get(7)?;
            let card_ids: Vec<String> =
                serde_json::from_str(&card_ids_json).unwrap_or_default();
            Ok(ReviewSessionData {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                algorithm: row.get(2)?,
                status: row.get(3)?,
                total_cards: row.get(4)?,
                reviewed_cards: row.get(5)?,
                correct_count: row.get(6)?,
                card_ids,
                current_index: row.get(8)?,
                started_at: row.get(9)?,
                completed_at: row.get(10)?,
                duration_seconds: row.get::<_, Option<i64>>(11)?.unwrap_or(0),
            })
        },
    );

    match result {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query error: {e}")),
    }
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
         AND vocabulary_id NOT IN (
             SELECT vocabulary_id FROM deck_cards WHERE deck_id = ?1
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
    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.name, d.description, d.language, d.algorithm,
                    d.card_count, d.created_at, d.updated_at,
                    (SELECT COUNT(*) FROM deck_cards dc
                     JOIN srs_progress sp ON sp.card_id = dc.id
                     WHERE dc.deck_id = d.id AND sp.due_date <= datetime('now')) AS due_today,
                    (SELECT COUNT(*) FROM deck_cards dc
                     JOIN srs_progress sp ON sp.card_id = dc.id
                     WHERE dc.deck_id = d.id AND sp.state = 'new') AS new_cards
             FROM decks d WHERE d.id = ?1",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    stmt.query_row(rusqlite::params![target_deck_id], |row: &rusqlite::Row| {
        Ok(DeckWithStats {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            language: row.get(3)?,
            algorithm: row.get(4)?,
            card_count: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            due_today: row.get(8)?,
            new_cards: row.get(9)?,
        })
    })
    .map_err(|e| format!("Fetch error: {e}"))
}

// ── Session History & Stats Commands ──────────────────────

#[tauri::command]
pub fn srs_list_sessions(
    state: State<'_, AppState>,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = lock_db(&state)?;
    let lim = limit.unwrap_or(50);

    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(ref s) = status {
        (
            format!(
                "SELECT rs.id, rs.deck_id, rs.algorithm, rs.status, rs.total_cards,
                        rs.reviewed_cards, rs.correct_count, rs.started_at, rs.completed_at,
                        rs.duration_seconds, COALESCE(rs.session_name, d.name, 'Review Session') as deck_name
                 FROM review_sessions rs
                 LEFT JOIN decks d ON d.id = rs.deck_id
                 WHERE rs.status = ?1
                 ORDER BY rs.started_at DESC
                 LIMIT ?2"
            ),
            vec![Box::new(s.clone()), Box::new(lim)],
        )
    } else {
        (
            format!(
                "SELECT rs.id, rs.deck_id, rs.algorithm, rs.status, rs.total_cards,
                        rs.reviewed_cards, rs.correct_count, rs.started_at, rs.completed_at,
                        rs.duration_seconds, COALESCE(rs.session_name, d.name, 'Review Session') as deck_name
                 FROM review_sessions rs
                 LEFT JOIN decks d ON d.id = rs.deck_id
                 ORDER BY rs.started_at DESC
                 LIMIT ?1"
            ),
            vec![Box::new(lim)],
        )
    };

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {e}"))?;
    let rows = stmt
        .query_map(param_refs.as_slice(), |row: &rusqlite::Row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "deck_id": row.get::<_, Option<String>>(1)?,
                "algorithm": row.get::<_, String>(2)?,
                "status": row.get::<_, String>(3)?,
                "total_cards": row.get::<_, i64>(4)?,
                "reviewed_cards": row.get::<_, i64>(5)?,
                "correct_count": row.get::<_, i64>(6)?,
                "started_at": row.get::<_, String>(7)?,
                "completed_at": row.get::<_, Option<String>>(8)?,
                "duration_seconds": row.get::<_, i64>(9)?,
                "deck_name": row.get::<_, String>(10)?,
            }))
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(sessions)
}

#[tauri::command]
pub fn srs_get_session_detail(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let conn = lock_db(&state)?;

    // Get session info
    let session = conn
        .query_row(
            "SELECT rs.id, rs.deck_id, rs.algorithm, rs.status, rs.total_cards,
                    rs.reviewed_cards, rs.correct_count, rs.started_at, rs.completed_at,
                    rs.duration_seconds, COALESCE(rs.session_name, d.name, 'Review Session') as session_name
             FROM review_sessions rs
             LEFT JOIN decks d ON d.id = rs.deck_id
             WHERE rs.id = ?1",
            rusqlite::params![session_id],
            |row: &rusqlite::Row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "deck_id": row.get::<_, Option<String>>(1)?,
                    "algorithm": row.get::<_, String>(2)?,
                    "status": row.get::<_, String>(3)?,
                    "total_cards": row.get::<_, i64>(4)?,
                    "reviewed_cards": row.get::<_, i64>(5)?,
                    "correct_count": row.get::<_, i64>(6)?,
                    "started_at": row.get::<_, String>(7)?,
                    "completed_at": row.get::<_, Option<String>>(8)?,
                    "duration_seconds": row.get::<_, i64>(9)?,
                    "session_name": row.get::<_, String>(10)?,
                }))
            },
        )
        .map_err(|e| format!("Session not found: {e}"))?;

    // Get card IDs from session
    let card_ids_json: String = conn
        .query_row(
            "SELECT card_ids FROM review_sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or_else(|_| "[]".to_string());

    let card_ids: Vec<String> =
        serde_json::from_str(&card_ids_json).unwrap_or_default();

    // Get card details
    let mut cards = Vec::new();
    for card_id in &card_ids {
        if let Ok(card) = conn.query_row(
            "SELECT dc.id, dc.front, dc.back, v.translation, v.word
             FROM deck_cards dc
             JOIN vocabulary v ON v.id = dc.vocabulary_id
             WHERE dc.id = ?1",
            rusqlite::params![card_id],
            |row: &rusqlite::Row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "front": row.get::<_, String>(1)?,
                    "back": row.get::<_, String>(2)?,
                    "translation": row.get::<_, Option<String>>(3)?,
                    "word": row.get::<_, String>(4)?,
                }))
            },
        ) {
            cards.push(card);
        }
    }

    // Get review results (from review_logs)
    let mut results_stmt = conn
        .prepare(
            "SELECT card_id, rating, state_after, time_spent_ms
             FROM review_logs
             WHERE session_id = ?1
             ORDER BY rowid ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let results: Vec<serde_json::Value> = results_stmt
        .query_map(rusqlite::params![session_id], |row: &rusqlite::Row| {
            let rating_str: String = row.get(0 + 1)?;
            let was_correct = rating_str == "good" || rating_str == "easy";
            // Map rating string to confidence number
            let confidence: i64 = match rating_str.as_str() {
                "again" => 1,
                "hard" => 3,
                "good" => 4,
                "easy" => 5,
                _ => 3,
            };
            Ok(serde_json::json!({
                "card_id": row.get::<_, String>(0)?,
                "rating": rating_str,
                "confidence": confidence,
                "was_correct": was_correct,
                "time_spent_ms": row.get::<_, i64>(3)?,
            }))
        })
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(serde_json::json!({
        "session": session,
        "cards": cards,
        "results": results,
    }))
}

#[tauri::command]
pub fn srs_delete_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let conn = lock_db(&state)?;

    // Delete review logs for this session
    conn.execute(
        "DELETE FROM review_logs WHERE session_id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| format!("Delete logs error: {e}"))?;

    // Delete session
    conn.execute(
        "DELETE FROM review_sessions WHERE id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| format!("Delete session error: {e}"))?;

    Ok(())
}

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
