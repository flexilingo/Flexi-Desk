use rusqlite::Connection;
use std::io::Write;

use super::types::*;

/// Export vocabulary as Anki .apkg file.
///
/// An .apkg is a ZIP containing:
/// - collection.anki21 (SQLite DB with notes/cards)
/// - media (JSON mapping, usually empty)
pub fn export_anki(
    conn: &Connection,
    file_path: &str,
    options: &ExportOptions,
) -> Result<ExportResult, String> {
    let temp_dir =
        tempfile::tempdir().map_err(|e| format!("Temp dir: {e}"))?;
    let db_path = temp_dir.path().join("collection.anki21");

    // Create Anki SQLite DB
    let anki_conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("Anki DB: {e}"))?;

    setup_anki_schema(&anki_conn)?;

    // Query vocabulary
    let mut query =
        "SELECT word, translation, definition, phonetic, examples, cefr_level, pos FROM vocabulary WHERE 1=1"
            .to_string();
    let mut param_values: Vec<String> = Vec::new();

    if let Some(lang) = &options.filter_language {
        query.push_str(&format!(" AND language = ?{}", param_values.len() + 1));
        param_values.push(lang.clone());
    }
    if let Some(cefr) = &options.filter_cefr {
        query.push_str(&format!(" AND cefr_level = ?{}", param_values.len() + 1));
        param_values.push(cefr.clone());
    }

    let mut stmt = conn.prepare(&query).map_err(|e| format!("Query: {e}"))?;
    let params: Vec<&dyn rusqlite::types::ToSql> = param_values
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|e| format!("Query: {e}"))?;

    let mut count: i64 = 0;
    let model_id: i64 = 1609876543210;
    let deck_id: i64 = 1609876543211;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    for row in rows {
        let (word, translation, definition, phonetic, examples, cefr, pos) =
            row.map_err(|e| format!("Row: {e}"))?;

        count += 1;
        let note_id = now + count;
        let card_id = now + count + 1_000_000;

        // Front = word, Back = translation + definition
        let back = format!(
            "{}{}{}",
            translation.as_deref().unwrap_or(""),
            definition
                .as_ref()
                .map(|d| format!("<br><i>{d}</i>"))
                .unwrap_or_default(),
            phonetic
                .as_ref()
                .map(|p| format!("<br>[{p}]"))
                .unwrap_or_default(),
        );

        // Fields separated by \x1f (Anki field separator)
        let flds = format!(
            "{}\x1f{}\x1f{}\x1f{}",
            word,
            back,
            phonetic.as_deref().unwrap_or(""),
            examples.as_deref().unwrap_or("")
        );

        // Tags
        let mut tags = String::new();
        if let Some(c) = &cefr {
            tags.push_str(c);
            tags.push(' ');
        }
        if let Some(p) = &pos {
            tags.push_str(p);
        }

        // Insert note
        anki_conn
            .execute(
                "INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
                 VALUES (?1, ?2, ?3, ?4, -1, ?5, ?6, ?7, 0, 0, '')",
                rusqlite::params![
                    note_id,
                    format!("{:x}", note_id),
                    model_id,
                    now,
                    tags.trim(),
                    flds,
                    word
                ],
            )
            .map_err(|e| format!("Insert note: {e}"))?;

        // Insert card
        anki_conn
            .execute(
                "INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
                 VALUES (?1, ?2, ?3, 0, ?4, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')",
                rusqlite::params![card_id, note_id, deck_id, now],
            )
            .map_err(|e| format!("Insert card: {e}"))?;
    }

    // Write model + deck config
    let models_json = format!(
        r#"{{"{model_id}":{{"id":{model_id},"name":"FlexiLingo","type":0,"mod":{now},"usn":-1,"sortf":0,"did":{deck_id},"tmpls":[{{"name":"Card 1","qfmt":"{{{{Front}}}}","afmt":"{{{{FrontSide}}}}<hr id=answer>{{{{Back}}}}","bqfmt":"","bafmt":"","did":null,"ord":0}}],"flds":[{{"name":"Front","ord":0,"sticky":false,"rtl":false,"font":"Arial","size":20,"media":[]}},{{"name":"Back","ord":1,"sticky":false,"rtl":false,"font":"Arial","size":20,"media":[]}},{{"name":"Phonetic","ord":2,"sticky":false,"rtl":false,"font":"Arial","size":14,"media":[]}},{{"name":"Examples","ord":3,"sticky":false,"rtl":false,"font":"Arial","size":14,"media":[]}}],"css":".card {{font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white;}}","latexPre":"","latexPost":"","latexsvg":false,"req":[[0,"any",[0]]]}}}}"#
    );
    let decks_json = format!(
        r#"{{"{deck_id}":{{"id":{deck_id},"name":"FlexiLingo Import","mod":{now},"usn":-1,"lrnToday":[0,0],"revToday":[0,0],"newToday":[0,0],"timeToday":[0,0],"collapsed":false,"browserCollapsed":false,"desc":"Exported from FlexiLingo Desktop","dyn":0,"conf":1,"extendNew":0,"extendRev":0}},"1":{{"id":1,"name":"Default","mod":0,"usn":0,"lrnToday":[0,0],"revToday":[0,0],"newToday":[0,0],"timeToday":[0,0],"collapsed":false,"browserCollapsed":false,"desc":"","dyn":0,"conf":1,"extendNew":10,"extendRev":50}}}}"#
    );

    anki_conn
        .execute(
            "UPDATE col SET models = ?1, decks = ?2",
            rusqlite::params![models_json, decks_json],
        )
        .map_err(|e| format!("Update col: {e}"))?;

    drop(anki_conn);

    // Create media file
    let media_path = temp_dir.path().join("media");
    std::fs::write(&media_path, "{}").map_err(|e| format!("Media: {e}"))?;

    // ZIP into .apkg
    let apkg_file =
        std::fs::File::create(file_path).map_err(|e| format!("Create apkg: {e}"))?;
    let mut zip = zip::ZipWriter::new(apkg_file);

    let zip_options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Add collection.anki21
    zip.start_file("collection.anki21", zip_options)
        .map_err(|e| format!("Zip: {e}"))?;
    let db_bytes = std::fs::read(&db_path).map_err(|e| format!("Read DB: {e}"))?;
    zip.write_all(&db_bytes).map_err(|e| format!("Zip write: {e}"))?;

    // Add media
    zip.start_file("media", zip_options)
        .map_err(|e| format!("Zip: {e}"))?;
    zip.write_all(b"{}").map_err(|e| format!("Zip write: {e}"))?;

    zip.finish().map_err(|e| format!("Zip finish: {e}"))?;

    Ok(ExportResult {
        file_path: file_path.to_string(),
        total_items: count,
        format: "anki".to_string(),
    })
}

/// Import from Anki .apkg file.
pub fn import_anki(
    conn: &Connection,
    file_path: &str,
    target_language: &str,
    skip_duplicates: bool,
) -> Result<ImportResult, String> {
    let temp_dir =
        tempfile::tempdir().map_err(|e| format!("Temp dir: {e}"))?;

    // Unzip
    let file = std::fs::File::open(file_path).map_err(|e| format!("Open: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Zip: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("Zip entry: {e}"))?;
        let out_path = temp_dir.path().join(entry.name());
        let mut out_file =
            std::fs::File::create(&out_path).map_err(|e| format!("Create: {e}"))?;
        std::io::copy(&mut entry, &mut out_file).map_err(|e| format!("Copy: {e}"))?;
    }

    // Find collection DB
    let db_path = if temp_dir.path().join("collection.anki21").exists() {
        temp_dir.path().join("collection.anki21")
    } else if temp_dir.path().join("collection.anki2").exists() {
        temp_dir.path().join("collection.anki2")
    } else {
        return Err("No collection database found in .apkg".to_string());
    };

    let anki_conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("Anki DB: {e}"))?;

    // Read notes
    let mut stmt = anki_conn
        .prepare("SELECT flds, tags FROM notes")
        .map_err(|e| format!("Query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
            ))
        })
        .map_err(|e| format!("Query: {e}"))?;

    let mut imported: i64 = 0;
    let mut skipped: i64 = 0;
    let mut errors = Vec::new();
    let mut row_num: i64 = 0;

    for row in rows {
        row_num += 1;
        let (flds, tags) = match row {
            Ok(r) => r,
            Err(e) => {
                errors.push(ImportError {
                    row: row_num,
                    message: format!("Row: {e}"),
                });
                continue;
            }
        };

        // Fields separated by \x1f
        let fields: Vec<&str> = flds.split('\x1f').collect();
        let word = match fields.first() {
            Some(w) if !w.is_empty() => strip_html(w),
            _ => {
                errors.push(ImportError {
                    row: row_num,
                    message: "Empty front field".to_string(),
                });
                continue;
            }
        };

        let translation = fields.get(1).map(|s| strip_html(s)).filter(|s| !s.is_empty());

        if skip_duplicates {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM vocabulary WHERE word = ?1 AND language = ?2",
                    rusqlite::params![word, target_language],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            if exists {
                skipped += 1;
                continue;
            }
        }

        // Extract CEFR from tags
        let cefr = tags
            .split_whitespace()
            .find(|t| ["A1", "A2", "B1", "B2", "C1", "C2"].contains(t))
            .map(|s| s.to_string());

        let result = conn.execute(
            "INSERT INTO vocabulary (id, word, translation, language, cefr_level, source_module)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, 'anki_import')",
            rusqlite::params![word, translation, target_language, cefr],
        );

        match result {
            Ok(_) => imported += 1,
            Err(e) => {
                errors.push(ImportError {
                    row: row_num,
                    message: format!("Insert: {e}"),
                });
            }
        }
    }

    Ok(ImportResult {
        total_rows: row_num,
        imported,
        skipped_duplicates: skipped,
        errors,
    })
}

/// Basic HTML tag stripping.
fn strip_html(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    result.trim().to_string()
}

/// Create minimal Anki schema.
fn setup_anki_schema(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
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
        );

        INSERT INTO col VALUES(1, 0, 0, 0, 11, 0, 0, 0, '{}', '{}', '{}', '{}', '{}');
        ",
    )
    .map_err(|e| format!("Anki schema: {e}"))?;

    Ok(())
}
