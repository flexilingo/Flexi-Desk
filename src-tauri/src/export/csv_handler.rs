use rusqlite::Connection;
use std::io::Write;

use super::types::*;

/// Export vocabulary to a CSV file.
pub fn export_csv(
    conn: &Connection,
    file_path: &str,
    options: &ExportOptions,
) -> Result<ExportResult, String> {
    let mut query =
        "SELECT word, translation, language, pos, cefr_level, definition, phonetic, examples, source_module, context_sentence, created_at FROM vocabulary WHERE 1=1"
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
    if let Some(source) = &options.filter_source {
        query.push_str(&format!(" AND source_module = ?{}", param_values.len() + 1));
        param_values.push(source.clone());
    }
    query.push_str(" ORDER BY created_at DESC");

    let mut stmt = conn.prepare(&query).map_err(|e| format!("Query: {e}"))?;

    let params: Vec<&dyn rusqlite::types::ToSql> = param_values
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok((0..11)
                .map(|i| row.get::<_, Option<String>>(i).unwrap_or(None).unwrap_or_default())
                .collect::<Vec<String>>())
        })
        .map_err(|e| format!("Query: {e}"))?;

    let file = std::fs::File::create(file_path).map_err(|e| format!("File create: {e}"))?;
    let mut writer = std::io::BufWriter::new(file);

    // Header
    writeln!(
        writer,
        "word,translation,language,pos,cefr_level,definition,phonetic,examples,source_module,context_sentence,created_at"
    )
    .map_err(|e| format!("Write: {e}"))?;

    let mut count: i64 = 0;
    for row in rows {
        let fields = row.map_err(|e| format!("Row: {e}"))?;
        let escaped: Vec<String> = fields
            .iter()
            .map(|f| {
                if f.contains(',') || f.contains('"') || f.contains('\n') {
                    format!("\"{}\"", f.replace('"', "\"\""))
                } else {
                    f.clone()
                }
            })
            .collect();
        writeln!(writer, "{}", escaped.join(",")).map_err(|e| format!("Write: {e}"))?;
        count += 1;
    }

    writer.flush().map_err(|e| format!("Flush: {e}"))?;

    Ok(ExportResult {
        file_path: file_path.to_string(),
        total_items: count,
        format: "csv".to_string(),
    })
}

/// Preview a CSV file for import (returns headers + first 10 rows).
pub fn preview_csv(
    file_path: &str,
    delimiter: Option<&str>,
) -> Result<ImportPreview, String> {
    let delim = match delimiter {
        Some("\t") | Some("tab") => b'\t',
        _ => b',',
    };

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delim)
        .has_headers(true)
        .from_path(file_path)
        .map_err(|e| format!("Open CSV: {e}"))?;

    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("Headers: {e}"))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    let mut sample_rows = Vec::new();
    let mut total_rows: i64 = 0;
    for result in reader.records() {
        total_rows += 1;
        if sample_rows.len() < 10 {
            let record = result.map_err(|e| format!("Row: {e}"))?;
            sample_rows.push(record.iter().map(|f| f.to_string()).collect());
        }
    }

    let suggested_mapping = auto_detect_mapping(&headers);

    Ok(ImportPreview {
        headers,
        sample_rows,
        total_rows,
        suggested_mapping,
    })
}

/// Execute CSV/TSV import with column mapping.
pub fn import_csv(
    conn: &Connection,
    file_path: &str,
    options: &ImportOptions,
) -> Result<ImportResult, String> {
    let delim = match options.format {
        ImportFormat::Tsv => b'\t',
        _ => b',',
    };

    let mapping = options
        .column_mapping
        .as_ref()
        .ok_or("Column mapping required for CSV import")?;

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delim)
        .has_headers(true)
        .from_path(file_path)
        .map_err(|e| format!("Open: {e}"))?;

    let mut imported: i64 = 0;
    let mut skipped: i64 = 0;
    let mut errors = Vec::new();
    let mut row_num: i64 = 0;

    for result in reader.records() {
        row_num += 1;
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                errors.push(ImportError {
                    row: row_num,
                    message: format!("Parse: {e}"),
                });
                continue;
            }
        };

        let get_field = |col: usize| -> Option<String> {
            record.get(col).map(|s| s.to_string()).filter(|s| !s.is_empty())
        };

        let word = match get_field(mapping.word_column) {
            Some(w) => w,
            None => {
                errors.push(ImportError {
                    row: row_num,
                    message: "Missing word".to_string(),
                });
                continue;
            }
        };

        // Skip duplicates check
        if options.skip_duplicates {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM vocabulary WHERE word = ?1 AND language = ?2",
                    rusqlite::params![word, options.target_language],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            if exists {
                skipped += 1;
                continue;
            }
        }

        let translation = mapping.translation_column.and_then(|c| get_field(c));
        let definition = mapping.definition_column.and_then(|c| get_field(c));
        let pos = mapping.pos_column.and_then(|c| get_field(c));
        let cefr = mapping.cefr_column.and_then(|c| get_field(c));
        let phonetic = mapping.phonetic_column.and_then(|c| get_field(c));
        let examples = mapping.examples_column.and_then(|c| get_field(c));
        let context = mapping.context_column.and_then(|c| get_field(c));

        let result = conn.execute(
            "INSERT INTO vocabulary (id, word, translation, language, pos, cefr_level, definition, phonetic, examples, source_module, context_sentence)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'import', ?9)",
            rusqlite::params![word, translation, options.target_language, pos, cefr, definition, phonetic, examples, context],
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auto_detect_standard_headers() {
        let headers = ["word", "translation", "phonetic", "cefr", "examples"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let mapping = auto_detect_mapping(&headers);
        assert_eq!(mapping.word_column, 0);
        assert_eq!(mapping.translation_column, Some(1));
        assert_eq!(mapping.phonetic_column, Some(2));
        assert_eq!(mapping.cefr_column, Some(3));
        assert_eq!(mapping.examples_column, Some(4));
    }

    #[test]
    fn test_auto_detect_anki_front_back_headers() {
        let headers = ["Front", "Back"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let mapping = auto_detect_mapping(&headers);
        assert_eq!(mapping.word_column, 0);
        assert_eq!(mapping.translation_column, Some(1));
    }

    #[test]
    fn test_auto_detect_unknown_headers_defaults_word_to_zero() {
        let headers = ["col_a", "col_b"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let mapping = auto_detect_mapping(&headers);
        assert_eq!(mapping.word_column, 0);
        assert_eq!(mapping.translation_column, None);
        assert_eq!(mapping.phonetic_column, None);
    }

    #[test]
    fn test_auto_detect_case_insensitive() {
        let headers = ["WORD", "TRANSLATION", "IPA"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let mapping = auto_detect_mapping(&headers);
        assert_eq!(mapping.word_column, 0);
        assert_eq!(mapping.translation_column, Some(1));
        assert_eq!(mapping.phonetic_column, Some(2));
    }

    #[test]
    fn test_auto_detect_term_and_sentence_aliases() {
        let headers = ["term", "meaning", "sentence"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let mapping = auto_detect_mapping(&headers);
        assert_eq!(mapping.word_column, 0);
        assert_eq!(mapping.translation_column, Some(1));
        assert_eq!(mapping.examples_column, Some(2));
    }

    fn vocab_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE vocabulary (
                id TEXT PRIMARY KEY, word TEXT NOT NULL,
                translation TEXT, language TEXT, pos TEXT,
                cefr_level TEXT, definition TEXT, phonetic TEXT,
                examples TEXT, source_module TEXT, context_sentence TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );",
        )
        .unwrap();
        conn
    }

    fn default_export_options() -> ExportOptions {
        ExportOptions {
            format: ExportFormat::Csv,
            include_fields: vec![],
            filter_language: None,
            filter_cefr: None,
            filter_source: None,
            deck_id: None,
        }
    }

    #[test]
    fn test_export_csv_empty_db_writes_header() {
        let conn = vocab_conn();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.csv");
        let result = export_csv(&conn, path.to_str().unwrap(), &default_export_options()).unwrap();
        assert_eq!(result.total_items, 0);
        assert_eq!(result.format, "csv");
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.starts_with("word,translation,language"));
    }

    #[test]
    fn test_export_csv_counts_exported_rows() {
        let conn = vocab_conn();
        conn.execute_batch(
            "INSERT INTO vocabulary (id, word, translation, language) VALUES
             ('1', 'hello', 'سلام', 'en'),
             ('2', 'world', 'جهان', 'en');",
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.csv");
        let result = export_csv(&conn, path.to_str().unwrap(), &default_export_options()).unwrap();
        assert_eq!(result.total_items, 2);
    }

    #[test]
    fn test_export_csv_escapes_commas_in_field() {
        let conn = vocab_conn();
        conn.execute_batch(
            "INSERT INTO vocabulary (id, word, translation, language)
             VALUES ('1', 'fast, efficient', 'سریع', 'en');",
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.csv");
        export_csv(&conn, path.to_str().unwrap(), &default_export_options()).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("\"fast, efficient\""));
    }

    #[test]
    fn test_export_csv_escapes_double_quotes_in_field() {
        let conn = vocab_conn();
        conn.execute_batch(
            r#"INSERT INTO vocabulary (id, word, translation, language)
             VALUES ('1', 'say "hi"', 'بگو سلام', 'en');"#,
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.csv");
        export_csv(&conn, path.to_str().unwrap(), &default_export_options()).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        // Inner quotes are doubled: "say ""hi"""
        assert!(content.contains("\"say \"\"hi\"\"\""));
    }

    #[test]
    fn test_preview_csv_returns_headers_and_rows() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.csv");
        std::fs::write(&path, "word,translation,phonetic\nhello,سلام,/hɛloʊ/\n").unwrap();
        let preview = preview_csv(path.to_str().unwrap(), None).unwrap();
        assert_eq!(preview.headers, vec!["word", "translation", "phonetic"]);
        assert_eq!(preview.total_rows, 1);
        assert_eq!(preview.sample_rows[0][0], "hello");
    }

    #[test]
    fn test_preview_csv_suggested_mapping_word_and_translation() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.csv");
        std::fs::write(&path, "word,translation\nhello,سلام\n").unwrap();
        let preview = preview_csv(path.to_str().unwrap(), None).unwrap();
        assert_eq!(preview.suggested_mapping.word_column, 0);
        assert_eq!(preview.suggested_mapping.translation_column, Some(1));
    }

    #[test]
    fn test_import_csv_basic_inserts_rows() {
        let conn = vocab_conn();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("import.csv");
        std::fs::write(&path, "word,translation\nhello,سلام\nworld,جهان\n").unwrap();

        let options = ImportOptions {
            format: ImportFormat::Csv,
            target_language: "en".to_string(),
            skip_duplicates: false,
            target_deck_id: None,
            column_mapping: Some(ColumnMapping {
                word_column: 0,
                translation_column: Some(1),
                definition_column: None,
                pos_column: None,
                cefr_column: None,
                phonetic_column: None,
                examples_column: None,
                context_column: None,
            }),
        };
        let result = import_csv(&conn, path.to_str().unwrap(), &options).unwrap();
        assert_eq!(result.imported, 2);
        assert_eq!(result.errors.len(), 0);
    }

    #[test]
    fn test_import_csv_skip_duplicates() {
        let conn = vocab_conn();
        // Pre-insert "hello" in English
        conn.execute_batch(
            "INSERT INTO vocabulary (id, word, language) VALUES ('1', 'hello', 'en');",
        )
        .unwrap();

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("import.csv");
        std::fs::write(&path, "word\nhello\nworld\n").unwrap();

        let options = ImportOptions {
            format: ImportFormat::Csv,
            target_language: "en".to_string(),
            skip_duplicates: true,
            target_deck_id: None,
            column_mapping: Some(ColumnMapping {
                word_column: 0,
                translation_column: None,
                definition_column: None,
                pos_column: None,
                cefr_column: None,
                phonetic_column: None,
                examples_column: None,
                context_column: None,
            }),
        };
        let result = import_csv(&conn, path.to_str().unwrap(), &options).unwrap();
        assert_eq!(result.imported, 1);
        assert_eq!(result.skipped_duplicates, 1);
    }

    #[test]
    fn test_import_csv_tsv_format() {
        let conn = vocab_conn();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("import.tsv");
        std::fs::write(&path, "word\ttranslation\nhello\tسلام\n").unwrap();

        let options = ImportOptions {
            format: ImportFormat::Tsv,
            target_language: "en".to_string(),
            skip_duplicates: false,
            target_deck_id: None,
            column_mapping: Some(ColumnMapping {
                word_column: 0,
                translation_column: Some(1),
                definition_column: None,
                pos_column: None,
                cefr_column: None,
                phonetic_column: None,
                examples_column: None,
                context_column: None,
            }),
        };
        let result = import_csv(&conn, path.to_str().unwrap(), &options).unwrap();
        assert_eq!(result.imported, 1);
    }
}

/// Auto-detect column mapping from header names.
fn auto_detect_mapping(headers: &[String]) -> ColumnMapping {
    let find = |names: &[&str]| -> Option<usize> {
        headers.iter().position(|h| {
            let lower = h.to_lowercase();
            names.iter().any(|n| lower.contains(n))
        })
    };

    ColumnMapping {
        word_column: find(&["word", "front", "term", "vocab"]).unwrap_or(0),
        translation_column: find(&["translation", "back", "meaning", "definition"]),
        definition_column: find(&["definition", "explain"]),
        pos_column: find(&["pos", "part of speech", "word class"]),
        cefr_column: find(&["cefr", "level"]),
        phonetic_column: find(&["phonetic", "pronunciation", "ipa"]),
        examples_column: find(&["example", "sentence"]),
        context_column: find(&["context"]),
    }
}
