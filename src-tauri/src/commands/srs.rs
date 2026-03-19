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

    let algorithm: String = conn
        .query_row(
            "SELECT algorithm FROM decks WHERE id = ?1",
            rusqlite::params![deck_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .map_err(|e| format!("Deck lookup error: {e}"))?;

    let card_limit = limit.unwrap_or(200);

    // Fetch due card IDs ordered by due_date
    let mut stmt = conn
        .prepare(
            "SELECT dc.id FROM deck_cards dc
             JOIN srs_progress sp ON sp.card_id = dc.id
             WHERE dc.deck_id = ?1 AND sp.due_date <= datetime('now')
             ORDER BY sp.due_date ASC
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
        "INSERT INTO review_sessions (id, deck_id, algorithm, total_cards, card_ids)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4)",
        rusqlite::params![deck_id, algorithm, total, card_ids_json],
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

    // Update session counters
    let is_correct = matches!(rating, Rating::Good | Rating::Easy);
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
