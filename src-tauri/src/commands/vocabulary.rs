use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;

fn lock_db<'a>(state: &'a State<'a, AppState>) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabularyEntry {
    pub id: i64,
    pub word: String,
    pub language: String,
    pub pos: Option<String>,
    pub cefr_level: Option<String>,
    pub translation: Option<String>,
    pub definition: Option<String>,
    pub phonetic: Option<String>,
    pub examples: Option<String>,
    pub source_module: Option<String>,
    pub context_sentence: Option<String>,
    pub deck_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabularyListResult {
    pub items: Vec<VocabularyEntry>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabularyStats {
    pub total_words: i64,
    pub by_language: Vec<(String, i64)>,
    pub by_cefr: Vec<(String, i64)>,
    pub by_source: Vec<(String, i64)>,
    pub in_decks: i64,
    pub not_in_decks: i64,
}

#[tauri::command]
pub fn vocabulary_list(
    state: State<'_, AppState>,
    language: Option<String>,
    cefr_level: Option<String>,
    source_module: Option<String>,
    search: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<VocabularyListResult, String> {
    let conn = lock_db(&state)?;
    let limit = page_size.unwrap_or(50);
    let p = page.unwrap_or(1);
    let offset = (p - 1) * limit;
    let sort = sort_by.unwrap_or_else(|| "created_at".to_string());
    let order = sort_order.unwrap_or_else(|| "desc".to_string());

    let mut where_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref lang) = language {
        where_clauses.push(format!("v.language = ?{}", params.len() + 1));
        params.push(Box::new(lang.clone()));
    }
    if let Some(ref cefr) = cefr_level {
        where_clauses.push(format!("v.cefr_level = ?{}", params.len() + 1));
        params.push(Box::new(cefr.clone()));
    }
    if let Some(ref src) = source_module {
        where_clauses.push(format!("v.source_module = ?{}", params.len() + 1));
        params.push(Box::new(src.clone()));
    }
    if let Some(ref s) = search {
        where_clauses.push(format!(
            "(v.word LIKE ?{} OR v.translation LIKE ?{})",
            params.len() + 1,
            params.len() + 1
        ));
        params.push(Box::new(format!("%{s}%")));
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let sort_col = match sort.as_str() {
        "word" => "v.word",
        "cefr_level" => "v.cefr_level",
        "language" => "v.language",
        _ => "v.created_at",
    };
    let sort_dir = if order == "asc" { "ASC" } else { "DESC" };

    // Count total
    let count_sql = format!("SELECT COUNT(*) FROM vocabulary v {where_sql}");
    let total: i64 = {
        let mut stmt = conn.prepare(&count_sql).map_err(|e| format!("Count error: {e}"))?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        stmt.query_row(param_refs.as_slice(), |row| row.get(0))
            .map_err(|e| format!("Count error: {e}"))?
    };

    // Fetch items
    let query_sql = format!(
        "SELECT v.id, v.word, v.language, v.pos, v.cefr_level, v.translation,
                v.definition, v.phonetic, v.examples, v.source_module, v.context_sentence,
                v.created_at, v.updated_at,
                (SELECT COUNT(*) FROM deck_cards dc WHERE dc.vocabulary_id = v.id) as deck_count
         FROM vocabulary v
         {where_sql}
         ORDER BY {sort_col} {sort_dir}
         LIMIT ?{} OFFSET ?{}",
        params.len() + 1,
        params.len() + 2,
    );

    let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = params;
    all_params.push(Box::new(limit));
    all_params.push(Box::new(offset));

    let mut stmt = conn.prepare(&query_sql).map_err(|e| format!("Query error: {e}"))?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = all_params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(VocabularyEntry {
            id: row.get(0)?,
            word: row.get(1)?,
            language: row.get(2)?,
            pos: row.get(3)?,
            cefr_level: row.get(4)?,
            translation: row.get(5)?,
            definition: row.get(6)?,
            phonetic: row.get(7)?,
            examples: row.get(8)?,
            source_module: row.get(9)?,
            context_sentence: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            deck_count: row.get(13)?,
        })
    }).map_err(|e| format!("Query error: {e}"))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("Row error: {e}"))?);
    }

    Ok(VocabularyListResult {
        items,
        total,
        page: p,
        page_size: limit,
    })
}

#[tauri::command]
pub fn vocabulary_update(
    state: State<'_, AppState>,
    id: i64,
    translation: Option<String>,
    definition: Option<String>,
    pos: Option<String>,
    cefr_level: Option<String>,
) -> Result<(), String> {
    let conn = lock_db(&state)?;

    conn.execute(
        "UPDATE vocabulary SET
            translation = COALESCE(?1, translation),
            definition = COALESCE(?2, definition),
            pos = COALESCE(?3, pos),
            cefr_level = COALESCE(?4, cefr_level),
            updated_at = datetime('now')
         WHERE id = ?5",
        rusqlite::params![translation, definition, pos, cefr_level, id],
    )
    .map_err(|e| format!("Update error: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn vocabulary_delete(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute("DELETE FROM vocabulary WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn vocabulary_bulk_delete(state: State<'_, AppState>, ids: Vec<i64>) -> Result<i64, String> {
    let conn = lock_db(&state)?;
    let mut deleted = 0i64;
    for id in &ids {
        let affected = conn.execute("DELETE FROM vocabulary WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Delete error: {e}"))?;
        deleted += affected as i64;
    }
    Ok(deleted)
}

#[tauri::command]
pub fn vocabulary_bulk_add_to_deck(
    state: State<'_, AppState>,
    vocabulary_ids: Vec<i64>,
    deck_id: String,
) -> Result<i64, String> {
    let conn = lock_db(&state)?;

    let algorithm: String = conn
        .query_row(
            "SELECT algorithm FROM decks WHERE id = ?1",
            rusqlite::params![deck_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Deck not found: {e}"))?;

    let mut added = 0i64;
    for vocab_id in &vocabulary_ids {
        // Skip if already in deck
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM deck_cards WHERE deck_id = ?1 AND vocabulary_id = ?2",
                rusqlite::params![deck_id, vocab_id],
                |row| row.get::<_, i64>(0).map(|c| c > 0),
            )
            .unwrap_or(false);

        if exists { continue; }

        // Get word info
        let (word, translation): (String, Option<String>) = conn
            .query_row(
                "SELECT word, translation FROM vocabulary WHERE id = ?1",
                rusqlite::params![vocab_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Vocab not found: {e}"))?;

        let back = translation.unwrap_or_default();

        // Insert deck_card
        conn.execute(
            "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4)",
            rusqlite::params![deck_id, vocab_id, word, back],
        )
        .map_err(|e| format!("Card insert error: {e}"))?;

        // Get the card ID just inserted
        let card_id: String = conn
            .query_row(
                "SELECT id FROM deck_cards WHERE deck_id = ?1 AND vocabulary_id = ?2",
                rusqlite::params![deck_id, vocab_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Card lookup: {e}"))?;

        // Create srs_progress
        conn.execute(
            "INSERT INTO srs_progress (id, card_id, algorithm, state, interval_days, due_date)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, 'new', 0, datetime('now'))",
            rusqlite::params![card_id, algorithm],
        )
        .map_err(|e| format!("Progress insert: {e}"))?;

        added += 1;
    }

    // Update deck card_count
    conn.execute(
        "UPDATE decks SET card_count = (SELECT COUNT(*) FROM deck_cards WHERE deck_id = ?1),
                updated_at = datetime('now')
         WHERE id = ?1",
        rusqlite::params![deck_id],
    )
    .map_err(|e| format!("Count update error: {e}"))?;

    Ok(added)
}

#[tauri::command]
pub fn vocabulary_export(
    state: State<'_, AppState>,
    language: Option<String>,
    format: String,
) -> Result<String, String> {
    let conn = lock_db(&state)?;

    let (where_sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(ref lang) = language {
        ("WHERE language = ?1".to_string(), vec![Box::new(lang.clone()) as Box<dyn rusqlite::types::ToSql>])
    } else {
        (String::new(), vec![])
    };

    let query = format!(
        "SELECT word, language, translation, definition, pos, cefr_level, examples, source_module
         FROM vocabulary {where_sql} ORDER BY word ASC"
    );

    let mut stmt = conn.prepare(&query).map_err(|e| format!("Query error: {e}"))?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(serde_json::json!({
            "word": row.get::<_, String>(0)?,
            "language": row.get::<_, String>(1)?,
            "translation": row.get::<_, Option<String>>(2)?,
            "definition": row.get::<_, Option<String>>(3)?,
            "pos": row.get::<_, Option<String>>(4)?,
            "cefr_level": row.get::<_, Option<String>>(5)?,
            "examples": row.get::<_, Option<String>>(6)?,
            "source_module": row.get::<_, Option<String>>(7)?,
        }))
    }).map_err(|e| format!("Query error: {e}"))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("Row error: {e}"))?);
    }

    match format.as_str() {
        "json" => serde_json::to_string_pretty(&entries).map_err(|e| format!("JSON error: {e}")),
        "csv" => {
            let mut csv = String::from("word,language,translation,definition,pos,cefr_level\n");
            for entry in &entries {
                csv.push_str(&format!(
                    "{},{},{},{},{},{}\n",
                    entry["word"].as_str().unwrap_or(""),
                    entry["language"].as_str().unwrap_or(""),
                    entry["translation"].as_str().unwrap_or(""),
                    entry["definition"].as_str().unwrap_or(""),
                    entry["pos"].as_str().unwrap_or(""),
                    entry["cefr_level"].as_str().unwrap_or(""),
                ));
            }
            Ok(csv)
        }
        _ => Err(format!("Unsupported format: {format}")),
    }
}

#[tauri::command]
pub fn vocabulary_stats(
    state: State<'_, AppState>,
    language: Option<String>,
) -> Result<VocabularyStats, String> {
    let conn = lock_db(&state)?;

    let total: i64 = if let Some(ref lang) = language {
        conn.query_row(
            "SELECT COUNT(*) FROM vocabulary WHERE language = ?1",
            rusqlite::params![lang],
            |row| row.get(0),
        )
    } else {
        conn.query_row("SELECT COUNT(*) FROM vocabulary", [], |row| row.get(0))
    }
    .map_err(|e| format!("Count error: {e}"))?;

    // By language
    let mut stmt = conn.prepare(
        "SELECT language, COUNT(*) FROM vocabulary GROUP BY language ORDER BY COUNT(*) DESC"
    ).map_err(|e| format!("Query: {e}"))?;
    let by_language: Vec<(String, i64)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("Query: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    // By CEFR
    let mut stmt = conn.prepare(
        "SELECT COALESCE(cefr_level, 'unknown'), COUNT(*) FROM vocabulary GROUP BY cefr_level ORDER BY cefr_level"
    ).map_err(|e| format!("Query: {e}"))?;
    let by_cefr: Vec<(String, i64)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("Query: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    // By source
    let mut stmt = conn.prepare(
        "SELECT COALESCE(source_module, 'unknown'), COUNT(*) FROM vocabulary GROUP BY source_module ORDER BY COUNT(*) DESC"
    ).map_err(|e| format!("Query: {e}"))?;
    let by_source: Vec<(String, i64)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("Query: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    // In decks
    let in_decks: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT vocabulary_id) FROM deck_cards",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Query: {e}"))?;

    Ok(VocabularyStats {
        total_words: total,
        by_language,
        by_cefr,
        by_source,
        in_decks,
        not_in_decks: total - in_decks,
    })
}
