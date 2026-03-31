use rusqlite::Connection;
use std::io::Write;

use super::types::*;

/// Export vocabulary to an Anki-compatible .apkg file.
///
/// Creates a SQLite database in Anki's schema format, packages it as a ZIP (.apkg).
pub fn export_anki(
    conn: &Connection,
    file_path: &str,
    options: &ExportOptions,
) -> Result<ExportResult, String> {
    // Build query based on filters
    let mut conditions = vec!["1=1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(ref lang) = options.filter_language {
        conditions.push("v.language = ?".to_string());
        params.push(Box::new(lang.clone()));
    }
    if let Some(ref cefr) = options.filter_cefr {
        conditions.push("v.cefr_level = ?".to_string());
        params.push(Box::new(cefr.clone()));
    }
    if let Some(ref deck_id) = options.deck_id {
        conditions.push(
            "v.id IN (SELECT card_id FROM srs_cards WHERE deck_id = ?)".to_string(),
        );
        params.push(Box::new(deck_id.clone()));
    }

    let where_clause = conditions.join(" AND ");
    let sql = format!(
        "SELECT v.word, v.translation, v.definition, v.pos, v.cefr_level, v.phonetic, v.examples \
         FROM vocabulary v WHERE {where_clause} ORDER BY v.word"
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query error: {e}"))?;

    let rows: Vec<(String, String, String, String, String, String, String)> = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0).unwrap_or_default(),
                row.get::<_, String>(1).unwrap_or_default(),
                row.get::<_, String>(2).unwrap_or_default(),
                row.get::<_, String>(3).unwrap_or_default(),
                row.get::<_, String>(4).unwrap_or_default(),
                row.get::<_, String>(5).unwrap_or_default(),
                row.get::<_, String>(6).unwrap_or_default(),
            ))
        })
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let total = rows.len() as i64;

    // Create temporary Anki SQLite database
    let tmp_dir = tempfile::tempdir().map_err(|e| format!("Temp dir error: {e}"))?;
    let db_path = tmp_dir.path().join("collection.anki2");

    let anki_conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("Anki DB error: {e}"))?;

    // Create Anki schema
    anki_conn
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS col (
                id INTEGER PRIMARY KEY,
                crt INTEGER NOT NULL,
                mod INTEGER NOT NULL,
                scm INTEGER NOT NULL,
                ver INTEGER NOT NULL,
                dty INTEGER NOT NULL,
                usn INTEGER NOT NULL,
                ls INTEGER NOT NULL,
                conf TEXT NOT NULL,
                models TEXT NOT NULL,
                decks TEXT NOT NULL,
                dconf TEXT NOT NULL,
                tags TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY,
                guid TEXT NOT NULL,
                mid INTEGER NOT NULL,
                mod INTEGER NOT NULL,
                usn INTEGER NOT NULL,
                tags TEXT NOT NULL,
                flds TEXT NOT NULL,
                sfld TEXT NOT NULL,
                csum INTEGER NOT NULL,
                flags INTEGER NOT NULL,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cards (
                id INTEGER PRIMARY KEY,
                nid INTEGER NOT NULL,
                did INTEGER NOT NULL,
                ord INTEGER NOT NULL,
                mod INTEGER NOT NULL,
                usn INTEGER NOT NULL,
                type INTEGER NOT NULL,
                queue INTEGER NOT NULL,
                due INTEGER NOT NULL,
                ivl INTEGER NOT NULL,
                factor INTEGER NOT NULL,
                reps INTEGER NOT NULL,
                lapses INTEGER NOT NULL,
                left INTEGER NOT NULL,
                odue INTEGER NOT NULL,
                odid INTEGER NOT NULL,
                flags INTEGER NOT NULL,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS revlog (
                id INTEGER PRIMARY KEY,
                cid INTEGER NOT NULL,
                usn INTEGER NOT NULL,
                ease INTEGER NOT NULL,
                ivl INTEGER NOT NULL,
                lastIvl INTEGER NOT NULL,
                factor INTEGER NOT NULL,
                time INTEGER NOT NULL,
                type INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS graves (
                usn INTEGER NOT NULL,
                oid INTEGER NOT NULL,
                type INTEGER NOT NULL
            );",
        )
        .map_err(|e| format!("Schema error: {e}"))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let model_id: i64 = now * 1000;
    let deck_id_anki: i64 = now * 1000 + 1;

    // Insert collection metadata
    let models_json = format!(
        r#"{{"{mid}":{{"id":{mid},"name":"FlexiLingo","type":0,"mod":0,"usn":0,"sortf":0,"did":{did},"tmpls":[{{"name":"Card 1","ord":0,"qfmt":"{{{{Front}}}}","afmt":"{{{{FrontSide}}}}<hr id=answer>{{{{Back}}}}","bqfmt":"","bafmt":"","did":null,"bfont":"","bsize":0}}],"flds":[{{"name":"Front","ord":0,"sticky":false,"rtl":false,"font":"Arial","size":20,"media":[]}},{{"name":"Back","ord":1,"sticky":false,"rtl":false,"font":"Arial","size":20,"media":[]}}],"css":".card {{font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white;}}","latexPre":"","latexPost":"","latexsvg":false,"req":[[0,"all",[0]]]}}}}"#,
        mid = model_id,
        did = deck_id_anki
    );

    let decks_json = format!(
        r#"{{"{did}":{{"id":{did},"name":"FlexiLingo","mod":0,"usn":0,"lrnToday":[0,0],"revToday":[0,0],"newToday":[0,0],"timeToday":[0,0],"collapsed":false,"browserCollapsed":false,"desc":"Exported from FlexiLingo","dyn":0,"conf":1,"extendNew":10,"extendRev":50}}}}"#,
        did = deck_id_anki
    );

    anki_conn
        .execute(
            "INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, '{}', ?, ?, '{}', '')",
            rusqlite::params![now, now, now * 1000, models_json, decks_json],
        )
        .map_err(|e| format!("Insert col error: {e}"))?;

    // Insert notes and cards
    for (i, (word, translation, definition, pos, cefr, phonetic, examples)) in
        rows.iter().enumerate()
    {
        let note_id = now * 1000 + (i as i64) + 100;
        let card_id = note_id + 100000;

        let mut back_parts = vec![];
        if !translation.is_empty() {
            back_parts.push(translation.clone());
        }
        if !definition.is_empty() {
            back_parts.push(definition.clone());
        }
        if !pos.is_empty() {
            back_parts.push(format!("({})", pos));
        }
        if !phonetic.is_empty() {
            back_parts.push(format!("/{}/", phonetic));
        }
        if !cefr.is_empty() {
            back_parts.push(format!("[{}]", cefr));
        }
        if !examples.is_empty() {
            back_parts.push(format!("Examples: {}", examples));
        }

        let back = back_parts.join(" | ");
        let flds = format!("{}\x1f{}", word, back);
        let csum = crc32(&word.to_lowercase()) as i64;

        anki_conn
            .execute(
                "INSERT INTO notes VALUES (?, ?, ?, ?, 0, '', ?, ?, ?, 0, '')",
                rusqlite::params![
                    note_id,
                    format!("fl{:010}", i),
                    model_id,
                    now,
                    flds,
                    word,
                    csum
                ],
            )
            .map_err(|e| format!("Insert note error: {e}"))?;

        anki_conn
            .execute(
                "INSERT INTO cards VALUES (?, ?, ?, 0, ?, 0, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')",
                rusqlite::params![card_id, note_id, deck_id_anki, now, i as i64],
            )
            .map_err(|e| format!("Insert card error: {e}"))?;
    }

    drop(anki_conn);

    // Package as .apkg (ZIP)
    let apkg_file =
        std::fs::File::create(file_path).map_err(|e| format!("File create error: {e}"))?;
    let mut zip = zip::ZipWriter::new(apkg_file);

    let zip_options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    zip.start_file("collection.anki2", zip_options)
        .map_err(|e| format!("ZIP error: {e}"))?;

    let db_bytes = std::fs::read(&db_path).map_err(|e| format!("Read DB error: {e}"))?;
    zip.write_all(&db_bytes)
        .map_err(|e| format!("ZIP write error: {e}"))?;

    // Empty media file
    zip.start_file("media", zip_options)
        .map_err(|e| format!("ZIP error: {e}"))?;
    zip.write_all(b"{}").map_err(|e| format!("ZIP write error: {e}"))?;

    zip.finish().map_err(|e| format!("ZIP finish error: {e}"))?;

    Ok(ExportResult {
        file_path: file_path.to_string(),
        total_items: total,
        format: "anki".to_string(),
    })
}

/// Import an Anki .apkg file into the vocabulary database.
pub fn import_anki(
    conn: &Connection,
    file_path: &str,
    target_language: &str,
    skip_duplicates: bool,
) -> Result<ImportResult, String> {
    let file = std::fs::File::open(file_path).map_err(|e| format!("File open error: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("ZIP read error: {e}"))?;

    // Extract collection.anki2
    let tmp_dir = tempfile::tempdir().map_err(|e| format!("Temp dir error: {e}"))?;
    let db_path = tmp_dir.path().join("collection.anki2");

    {
        let mut anki_file = archive
            .by_name("collection.anki2")
            .map_err(|e| format!("No collection.anki2 in archive: {e}"))?;
        let mut out =
            std::fs::File::create(&db_path).map_err(|e| format!("File create error: {e}"))?;
        std::io::copy(&mut anki_file, &mut out)
            .map_err(|e| format!("Extract error: {e}"))?;
    }

    let anki_conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("Anki DB error: {e}"))?;

    // Read notes
    let mut stmt = anki_conn
        .prepare("SELECT flds, sfld FROM notes")
        .map_err(|e| format!("Query error: {e}"))?;

    let notes: Vec<(String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0).unwrap_or_default(),
                row.get::<_, String>(1).unwrap_or_default(),
            ))
        })
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let total = notes.len() as i64;
    let mut imported: i64 = 0;
    let mut skipped: i64 = 0;
    let mut errors: Vec<ImportError> = vec![];

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    for (i, (flds, _sfld)) in notes.iter().enumerate() {
        let parts: Vec<&str> = flds.split('\x1f').collect();
        let front = parts.first().map(|s| s.trim()).unwrap_or("");
        let back = parts.get(1).map(|s| s.trim()).unwrap_or("");

        if front.is_empty() {
            errors.push(ImportError {
                row: i as i64 + 1,
                message: "Empty front field".to_string(),
            });
            continue;
        }

        // Check for duplicates
        if skip_duplicates {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM vocabulary WHERE word = ? AND language = ?",
                    rusqlite::params![front, target_language],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if exists {
                skipped += 1;
                continue;
            }
        }

        let result = conn.execute(
            "INSERT INTO vocabulary (word, translation, language, source_module, created_at, updated_at) \
             VALUES (?, ?, ?, 'anki_import', ?, ?)",
            rusqlite::params![front, back, target_language, now, now],
        );

        match result {
            Ok(_) => imported += 1,
            Err(e) => {
                errors.push(ImportError {
                    row: i as i64 + 1,
                    message: format!("Insert error: {e}"),
                });
            }
        }
    }

    Ok(ImportResult {
        total_rows: total,
        imported,
        skipped_duplicates: skipped,
        errors,
    })
}

/// Export a specific deck (by deck_id) to an Anki .apkg file.
/// Reads cards from deck_cards JOIN vocabulary for proper deck-scoped export.
pub fn export_deck_anki(
    conn: &Connection,
    file_path: &str,
    deck_id: &str,
) -> Result<ExportResult, String> {
    let sql = "SELECT v.word, COALESCE(dc.back, v.translation, '') AS back,
                      COALESCE(v.definition, '') AS definition,
                      COALESCE(v.pos, '') AS pos,
                      COALESCE(v.cefr_level, '') AS cefr,
                      COALESCE(v.phonetic, '') AS phonetic,
                      COALESCE(v.examples, '') AS examples
               FROM deck_cards dc
               JOIN vocabulary v ON v.id = dc.vocabulary_id
               WHERE dc.deck_id = ?1
               ORDER BY dc.added_at ASC";

    let mut stmt = conn.prepare(sql).map_err(|e| format!("Query error: {e}"))?;

    let rows: Vec<(String, String, String, String, String, String, String)> = stmt
        .query_map(rusqlite::params![deck_id], |row| {
            Ok((
                row.get::<_, String>(0).unwrap_or_default(),
                row.get::<_, String>(1).unwrap_or_default(),
                row.get::<_, String>(2).unwrap_or_default(),
                row.get::<_, String>(3).unwrap_or_default(),
                row.get::<_, String>(4).unwrap_or_default(),
                row.get::<_, String>(5).unwrap_or_default(),
                row.get::<_, String>(6).unwrap_or_default(),
            ))
        })
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    if rows.is_empty() {
        return Err("Deck has no cards to export".to_string());
    }

    let total = rows.len() as i64;

    // Get deck name for Anki deck metadata
    let deck_name: String = conn
        .query_row(
            "SELECT name FROM decks WHERE id = ?1",
            rusqlite::params![deck_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "FlexiLingo Deck".to_string());

    let tmp_dir = tempfile::tempdir().map_err(|e| format!("Temp dir error: {e}"))?;
    let db_path = tmp_dir.path().join("collection.anki2");
    let anki_conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("Anki DB error: {e}"))?;

    anki_conn
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS col (id INTEGER PRIMARY KEY, crt INTEGER NOT NULL, mod INTEGER NOT NULL, scm INTEGER NOT NULL, ver INTEGER NOT NULL, dty INTEGER NOT NULL, usn INTEGER NOT NULL, ls INTEGER NOT NULL, conf TEXT NOT NULL, models TEXT NOT NULL, decks TEXT NOT NULL, dconf TEXT NOT NULL, tags TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, guid TEXT NOT NULL, mid INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL, tags TEXT NOT NULL, flds TEXT NOT NULL, sfld TEXT NOT NULL, csum INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL, ord INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL, type INTEGER NOT NULL, queue INTEGER NOT NULL, due INTEGER NOT NULL, ivl INTEGER NOT NULL, factor INTEGER NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL, left INTEGER NOT NULL, odue INTEGER NOT NULL, odid INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS revlog (id INTEGER PRIMARY KEY, cid INTEGER NOT NULL, usn INTEGER NOT NULL, ease INTEGER NOT NULL, ivl INTEGER NOT NULL, lastIvl INTEGER NOT NULL, factor INTEGER NOT NULL, time INTEGER NOT NULL, type INTEGER NOT NULL);
             CREATE TABLE IF NOT EXISTS graves (usn INTEGER NOT NULL, oid INTEGER NOT NULL, type INTEGER NOT NULL);",
        )
        .map_err(|e| format!("Schema error: {e}"))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let model_id: i64 = now * 1000;
    let did: i64 = now * 1000 + 1;

    let models_json = format!(
        r#"{{"{mid}":{{"id":{mid},"name":"FlexiLingo","type":0,"mod":0,"usn":0,"sortf":0,"did":{did},"tmpls":[{{"name":"Card 1","ord":0,"qfmt":"{{{{Front}}}}","afmt":"{{{{FrontSide}}}}<hr id=answer>{{{{Back}}}}","bqfmt":"","bafmt":"","did":null,"bfont":"","bsize":0}}],"flds":[{{"name":"Front","ord":0,"sticky":false,"rtl":false,"font":"Arial","size":20,"media":[]}},{{"name":"Back","ord":1,"sticky":false,"rtl":false,"font":"Arial","size":20,"media":[]}}],"css":".card {{font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white;}}","latexPre":"","latexPost":"","latexsvg":false,"req":[[0,"all",[0]]]}}}}"#,
        mid = model_id,
        did = did,
    );

    let decks_json = format!(
        r#"{{"{did}":{{"id":{did},"name":"{name}","mod":0,"usn":0,"lrnToday":[0,0],"revToday":[0,0],"newToday":[0,0],"timeToday":[0,0],"collapsed":false,"browserCollapsed":false,"desc":"Exported from FlexiLingo","dyn":0,"conf":1,"extendNew":10,"extendRev":50}}}}"#,
        did = did,
        name = deck_name.replace('"', "\\\""),
    );

    anki_conn
        .execute(
            "INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, '{}', ?, ?, '{}', '')",
            rusqlite::params![now, now, now * 1000, models_json, decks_json],
        )
        .map_err(|e| format!("Insert col error: {e}"))?;

    for (i, (word, back, definition, pos, cefr, phonetic, examples)) in rows.iter().enumerate() {
        let note_id = now * 1000 + (i as i64) + 100;
        let card_id = note_id + 100000;

        let mut back_parts = vec![];
        if !back.is_empty() {
            back_parts.push(back.clone());
        }
        if !definition.is_empty() {
            back_parts.push(definition.clone());
        }
        if !pos.is_empty() {
            back_parts.push(format!("({})", pos));
        }
        if !phonetic.is_empty() {
            back_parts.push(format!("/{}/", phonetic));
        }
        if !cefr.is_empty() {
            back_parts.push(format!("[{}]", cefr));
        }
        if !examples.is_empty() {
            back_parts.push(format!("Examples: {}", examples));
        }

        let back_str = back_parts.join(" | ");
        let flds = format!("{}\x1f{}", word, back_str);
        let csum = crc32(&word.to_lowercase()) as i64;

        anki_conn
            .execute(
                "INSERT INTO notes VALUES (?, ?, ?, ?, 0, '', ?, ?, ?, 0, '')",
                rusqlite::params![note_id, format!("fl{:010}", i), model_id, now, flds, word, csum],
            )
            .map_err(|e| format!("Insert note error: {e}"))?;

        anki_conn
            .execute(
                "INSERT INTO cards VALUES (?, ?, ?, 0, ?, 0, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')",
                rusqlite::params![card_id, note_id, did, now, i as i64],
            )
            .map_err(|e| format!("Insert card error: {e}"))?;
    }

    drop(anki_conn);

    let apkg_file =
        std::fs::File::create(file_path).map_err(|e| format!("File create error: {e}"))?;
    let mut zip = zip::ZipWriter::new(apkg_file);
    let zip_options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    zip.start_file("collection.anki2", zip_options)
        .map_err(|e| format!("ZIP error: {e}"))?;
    let db_bytes = std::fs::read(&db_path).map_err(|e| format!("Read DB error: {e}"))?;
    zip.write_all(&db_bytes)
        .map_err(|e| format!("ZIP write error: {e}"))?;
    zip.start_file("media", zip_options)
        .map_err(|e| format!("ZIP error: {e}"))?;
    zip.write_all(b"{}").map_err(|e| format!("ZIP write error: {e}"))?;
    zip.finish().map_err(|e| format!("ZIP finish error: {e}"))?;

    Ok(ExportResult {
        file_path: file_path.to_string(),
        total_items: total,
        format: "anki".to_string(),
    })
}

/// Simple CRC32 for Anki note checksums.
fn crc32(s: &str) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for byte in s.bytes() {
        crc ^= byte as u32;
        for _ in 0..8 {
            if crc & 1 != 0 {
                crc = (crc >> 1) ^ 0xEDB8_8320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}
