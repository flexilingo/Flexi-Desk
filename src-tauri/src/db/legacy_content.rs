//! V041: the content of the modules v0.7 removed stays visible.
//!
//! v0.6.3 had its own Reading and Writing pages. v0.7 replaced them with the Reader and
//! Writing practice, which read different tables, so a saved article or a graded essay would
//! silently disappear from the app (the old tables are NOT touched). This migration COPIES:
//!
//! * `reading_documents` -> `reader_documents` (kind `text`) with `reader_text_pages`, cut by
//!   the Reader's own page splitting; `reading_highlights` -> `reader_word_log` (the words the
//!   user opened, with their sentence).
//! * graded `writing_sessions` (+ `writing_corrections`) -> `wp_sessions`, status `graded`,
//!   prompt source `migrated`. An essay that was never graded has no place in the graded
//!   history, so it becomes a Reader text document instead and stays readable.
//!
//! Idempotent: every copied row has a deterministic id (`legacy-…`, `migrated-…`) and is
//! skipped when it already exists. Runs inside the migration's transaction.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::reader::text;

/// "2026-03-01 10:20:30" (SQLite `datetime('now')`) -> "2026-03-01T10:20:30.000Z".
fn iso(s: &str) -> String {
    let s = s.trim();
    if s.contains('T') || s.is_empty() {
        s.to_string()
    } else {
        format!("{}.000Z", s.replacen(' ', "T", 1))
    }
}

fn host_of(url: &str) -> Option<String> {
    let rest = url.split("://").nth(1)?;
    let host = rest.split(['/', '?', '#']).next()?;
    (!host.is_empty()).then(|| host.chars().take(120).collect())
}

fn exists(conn: &Connection, table: &str, id: &str) -> Result<bool, String> {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table} WHERE id = ?1"), params![id], |r| r.get::<_, i64>(0))
        .map(|n| n > 0)
        .map_err(|e| format!("V041: {e}"))
}

struct NewText<'a> {
    id: &'a str,
    title: &'a str,
    filename: &'a str,
    language: &'a str,
    pages: &'a [String],
    last_page: i64,
    finished_at: Option<&'a str>,
    created_at: &'a str,
    updated_at: &'a str,
}

fn insert_text_doc(conn: &Connection, d: &NewText) -> Result<(), String> {
    let words: i64 = d.pages.iter().map(|p| text::count_words(p, d.language)).sum();
    let bytes: i64 = d.pages.iter().map(|p| p.len() as i64).sum();
    let title: String = {
        let t = d.title.trim();
        (if t.is_empty() { "Text" } else { t }).chars().take(200).collect()
    };
    conn.execute(
        "INSERT INTO reader_documents (id, title, original_filename, kind, file_path, size_bytes, language,
                page_count, word_count, extraction_method, last_page, finished_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'text', '', ?4, ?5, ?6, ?7, 'text', ?8, ?9, ?10, ?11)",
        params![
            d.id, title, d.filename, bytes, d.language, d.pages.len() as i64, words,
            d.last_page.clamp(1, d.pages.len() as i64), d.finished_at, d.created_at, d.updated_at
        ],
    )
    .map_err(|e| format!("V041: reader document: {e}"))?;
    for (i, content) in d.pages.iter().enumerate() {
        conn.execute(
            "INSERT INTO reader_text_pages (document_id, page, content) VALUES (?1, ?2, ?3)",
            params![d.id, (i + 1) as i64, content],
        )
        .map_err(|e| format!("V041: reader page: {e}"))?;
    }
    Ok(())
}

pub(super) fn run_v041_legacy_content(conn: &Connection) -> Result<(), String> {
    copy_reading(conn)?;
    copy_writing(conn)
}

fn copy_reading(conn: &Connection) -> Result<(), String> {
    type Doc = (String, String, String, String, Option<String>, f64, String, String);
    let docs: Vec<Doc> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, content, language, source_url, progress, created_at, updated_at
                 FROM reading_documents ORDER BY created_at",
            )
            .map_err(|e| format!("V041: {e}"))?;
        let rows = stmt
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get::<_, Option<f64>>(5)?.unwrap_or(0.0), r.get(6)?, r.get(7)?))
            })
            .map_err(|e| format!("V041: {e}"))?;
        rows.collect::<Result<_, _>>().map_err(|e| format!("V041: {e}"))?
    };

    for (id, title, content, language, url, progress, created, updated) in docs {
        let rid = format!("legacy-{id}");
        if exists(conn, "reader_documents", &rid)? {
            continue;
        }
        let pages = text::split_pages(&content);
        if pages.is_empty() {
            continue;
        }
        let (created, updated) = (iso(&created), iso(&updated));
        let progress = progress.clamp(0.0, 1.0);
        let last_page = ((progress * pages.len() as f64).ceil() as i64).max(1);
        let filename = url.as_deref().and_then(host_of).unwrap_or_else(|| "saved-article.txt".to_string());
        insert_text_doc(
            conn,
            &NewText {
                id: &rid,
                title: &title,
                filename: &filename,
                language: &language,
                pages: &pages,
                last_page,
                finished_at: (progress >= 0.95).then_some(updated.as_str()),
                created_at: &created,
                updated_at: &updated,
            },
        )?;

        // Highlights: the words the user looked up, with their sentence, in the page that holds it.
        let hls: Vec<(String, String, Option<String>, String)> = {
            let mut stmt = conn
                .prepare("SELECT id, word, sentence, created_at FROM reading_highlights WHERE document_id = ?1 ORDER BY created_at")
                .map_err(|e| format!("V041: {e}"))?;
            let rows = stmt
                .query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
                .map_err(|e| format!("V041: {e}"))?;
            rows.collect::<Result<_, _>>().map_err(|e| format!("V041: {e}"))?
        };
        for (hid, word, sentence, hcreated) in hls {
            let word = word.trim().to_string();
            let n = word.chars().count();
            if n == 0 || n > 120 {
                continue;
            }
            let sentence = sentence.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let page = sentence
                .as_deref()
                .and_then(|s| pages.iter().position(|p| p.contains(s)))
                .or_else(|| pages.iter().position(|p| p.contains(&word)))
                .map_or(1, |i| i as i64 + 1);
            conn.execute(
                "INSERT OR IGNORE INTO reader_word_log (id, document_id, word, word_key, context, page, language, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    format!("legacy-hl-{hid}"), rid, word, word.to_lowercase(),
                    sentence.map(|s| s.chars().take(500).collect::<String>()), page, language, iso(&hcreated)
                ],
            )
            .map_err(|e| format!("V041: word log: {e}"))?;
        }
    }
    Ok(())
}

/// Legacy score (0-100) on the general rubrics' 0-10 scale, in half points.
fn to_ten(v: f64) -> f64 {
    ((v.clamp(0.0, 100.0) / 10.0) * 2.0).round() / 2.0
}

fn string_list(v: &Value) -> Value {
    Value::Array(
        v.as_array()
            .map(|a| a.iter().filter(|x| x.is_string()).cloned().collect())
            .unwrap_or_default(),
    )
}

fn copy_writing(conn: &Connection) -> Result<(), String> {
    struct Ws {
        id: String,
        title: String,
        language: String,
        task_type: String,
        prompt_text: Option<String>,
        original: String,
        corrected: Option<String>,
        words: i64,
        limit_min: Option<i64>,
        elapsed: i64,
        status: String,
        overall: Option<f64>,
        grammar: Option<f64>,
        vocab: Option<f64>,
        coherence: Option<f64>,
        task: Option<f64>,
        feedback: Option<String>,
        created: String,
        updated: String,
        submitted: Option<String>,
        completed: Option<String>,
    }
    let sessions: Vec<Ws> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, language, task_type, prompt_text, original_text, corrected_text, word_count,
                        time_limit_min, elapsed_seconds, status, overall_score, grammar_score, vocabulary_score,
                        coherence_score, task_score, feedback_json, created_at, updated_at, submitted_at, completed_at
                 FROM writing_sessions ORDER BY created_at",
            )
            .map_err(|e| format!("V041: {e}"))?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Ws {
                    id: r.get(0)?, title: r.get(1)?, language: r.get(2)?, task_type: r.get(3)?,
                    prompt_text: r.get(4)?, original: r.get(5)?, corrected: r.get(6)?, words: r.get(7)?,
                    limit_min: r.get(8)?, elapsed: r.get(9)?, status: r.get(10)?, overall: r.get(11)?,
                    grammar: r.get(12)?, vocab: r.get(13)?, coherence: r.get(14)?, task: r.get(15)?,
                    feedback: r.get(16)?, created: r.get(17)?, updated: r.get(18)?,
                    submitted: r.get(19)?, completed: r.get(20)?,
                })
            })
            .map_err(|e| format!("V041: {e}"))?;
        rows.collect::<Result<_, _>>().map_err(|e| format!("V041: {e}"))?
    };

    for s in sessions {
        if s.original.trim().is_empty() {
            continue;
        }
        let created = iso(&s.created);
        let updated = iso(&s.updated);
        let graded = matches!(s.status.as_str(), "corrected" | "scored") && s.overall.is_some();

        if !graded {
            // Never graded: keep the essay readable in the Reader.
            let rid = format!("legacy-ws-{}", s.id);
            if exists(conn, "reader_documents", &rid)? {
                continue;
            }
            let pages = text::split_pages(&s.original);
            if pages.is_empty() {
                continue;
            }
            insert_text_doc(
                conn,
                &NewText {
                    id: &rid,
                    title: &s.title,
                    filename: "my-writing.txt",
                    language: &s.language,
                    pages: &pages,
                    last_page: 1,
                    finished_at: None,
                    created_at: &created,
                    updated_at: &updated,
                },
            )?;
            continue;
        }

        let wid = format!("migrated-{}", s.id);
        if exists(conn, "wp_sessions", &wid)? {
            continue;
        }
        let exam_type = if s.task_type == "email" { "general_email" } else { "general_essay" };
        let prompt_text = s.prompt_text.clone().filter(|p| !p.trim().is_empty()).unwrap_or_else(|| s.title.clone());
        let prompt = json!({
            "id": wid, "exam_type": exam_type, "topic": s.title, "prompt_text": prompt_text,
            "difficulty": "intermediate", "source": "migrated", "supplementary_data": Value::Null,
            "is_active": false, "usage_count": 0, "created_at": created,
        });

        let mut criteria = serde_json::Map::new();
        let gv: Vec<f64> = [s.grammar, s.vocab].into_iter().flatten().collect();
        if !gv.is_empty() {
            criteria.insert("Grammar and Vocabulary".into(), json!(to_ten(gv.iter().sum::<f64>() / gv.len() as f64)));
        }
        if let Some(c) = s.coherence {
            criteria.insert("Clarity".into(), json!(to_ten(c)));
        }
        if let Some(t) = s.task {
            criteria.insert("Task Completion".into(), json!(to_ten(t)));
        }

        let legacy: Value = s.feedback.as_deref().and_then(|f| serde_json::from_str(f).ok()).unwrap_or(Value::Null);
        let highlights: Vec<Value> = {
            let mut stmt = conn
                .prepare(
                    "SELECT original_span, corrected_span, error_type, explanation FROM writing_corrections
                     WHERE session_id = ?1 ORDER BY start_offset",
                )
                .map_err(|e| format!("V041: {e}"))?;
            let rows = stmt
                .query_map(params![s.id], |r| {
                    let kind: String = r.get(2)?;
                    let kind = match kind.as_str() {
                        "vocabulary" | "spelling" | "punctuation" => kind,
                        _ => "grammar".to_string(),
                    };
                    Ok(json!({
                        "text": r.get::<_, String>(0)?, "correction": r.get::<_, String>(1)?, "type": kind,
                        "explanation": r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    }))
                })
                .map_err(|e| format!("V041: {e}"))?;
            rows.collect::<Result<_, _>>().map_err(|e| format!("V041: {e}"))?
        };
        let feedback = json!({
            "summary": legacy.get("summary").and_then(|v| v.as_str()).unwrap_or(""),
            "strengths": string_list(&legacy["strengths"]),
            "weaknesses": string_list(&legacy["weaknesses"]),
            "suggestions": string_list(&legacy["suggestions"]),
            "error_highlights": highlights,
            "migrated": true,
        });

        let limit = s.limit_min.filter(|m| *m > 0).map(|m| m * 60);
        let submitted = s.submitted.as_deref().map(iso).unwrap_or_else(|| updated.clone());
        let completed = s.completed.as_deref().map(iso).unwrap_or_else(|| updated.clone());
        conn.execute(
            "INSERT INTO wp_sessions (id, exam_type, status, prompt_json, essay_text, word_count, time_limit_seconds,
                time_spent_seconds, timer_enabled, overall_score, criteria_scores_json, feedback_json,
                ai_rewritten_version, started_at, submitted_at, graded_at, created_at, updated_at)
             VALUES (?1, ?2, 'graded', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?13, ?16)",
            params![
                wid, exam_type, prompt.to_string(), s.original, s.words.max(0), limit, s.elapsed.max(0),
                limit.is_some() as i64, s.overall.map(to_ten), Value::Object(criteria).to_string(),
                feedback.to_string(), s.corrected.filter(|c| !c.trim().is_empty()), created, submitted, completed, updated
            ],
        )
        .map_err(|e| format!("V041: writing session: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::schema::{run_migrations, run_migrations_through};
    use super::*;

    /// A database exactly as v0.6.3 left it (migrations through V025) with a saved article,
    /// its highlights and three writing sessions.
    fn v063() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations_through(&conn, "V025").unwrap();
        let article = format!("{}\n\n{}", "The harbour was quiet. Boats rested at the pier.", "A gull landed on the rail. It looked around.");
        conn.execute(
            "INSERT INTO reading_documents (id, title, content, language, source_type, source_url, word_count, progress, created_at, updated_at)
             VALUES ('r1', 'Harbour', ?1, 'en', 'url', 'https://news.example.com/a/b', 20, 0.5, '2026-03-01 10:20:30', '2026-03-02 11:00:00')",
            params![article],
        ).unwrap();
        conn.execute("INSERT INTO reading_documents (id, title, content, language) VALUES ('r2', 'Empty', '   ', 'en')", []).unwrap();
        conn.execute(
            "INSERT INTO reading_highlights (id, document_id, word, sentence, word_index) VALUES ('h1', 'r1', 'Gull', 'A gull landed on the rail.', 3)",
            [],
        ).unwrap();
        conn.execute("INSERT INTO reading_highlights (id, document_id, word) VALUES ('h2', 'r1', 'zzz-not-in-text')", []).unwrap();
        // graded (scored) with corrections
        conn.execute(
            "INSERT INTO writing_sessions (id, title, language, task_type, prompt_text, original_text, corrected_text, word_count,
                time_limit_min, elapsed_seconds, status, overall_score, grammar_score, vocabulary_score, coherence_score, task_score,
                feedback_json, created_at, updated_at, submitted_at, completed_at)
             VALUES ('w1', 'My weekend', 'en', 'essay', 'Describe your weekend.', 'I goed to the park.', 'I went to the park.', 5,
                20, 600, 'scored', 78, 70, 80, 90, 60, '{\"summary\":\"Good start\",\"strengths\":[\"clear\"],\"suggestions\":[\"check tenses\"]}',
                '2026-04-01 09:00:00', '2026-04-01 09:30:00', '2026-04-01 09:20:00', '2026-04-01 09:30:00')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO writing_corrections (id, session_id, original_span, corrected_span, error_type, explanation, start_offset, end_offset)
             VALUES ('c1', 'w1', 'goed', 'went', 'style', 'Irregular verb', 2, 6)",
            [],
        ).unwrap();
        // never graded: essay text only
        conn.execute(
            "INSERT INTO writing_sessions (id, title, language, original_text, word_count, status, created_at, updated_at)
             VALUES ('w2', 'Draft letter', 'en', 'Dear friend, how are you?', 5, 'draft', '2026-04-02 09:00:00', '2026-04-02 09:00:00')",
            [],
        ).unwrap();
        conn.execute("INSERT INTO writing_sessions (id, title, language, original_text, status) VALUES ('w3', 'Blank', 'en', '', 'draft')", []).unwrap();
        conn
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn saved_articles_become_local_text_documents_with_pages_and_highlights() {
        let conn = v063();
        run_migrations(&conn).expect("migrations through V041");
        let (title, kind, lang, pages, last_page, name, created): (String, String, String, i64, i64, String, String) = conn
            .query_row(
                "SELECT title, kind, language, page_count, last_page, original_filename, created_at FROM reader_documents WHERE id = 'legacy-r1'",
                [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
            ).unwrap();
        assert_eq!((title.as_str(), kind.as_str(), lang.as_str()), ("Harbour", "text", "en"));
        assert_eq!(name, "news.example.com");
        assert_eq!(created, "2026-03-01T10:20:30.000Z");
        assert!(pages >= 1 && last_page >= 1 && last_page <= pages);
        let stored: String = conn.query_row("SELECT group_concat(content, ' ') FROM reader_text_pages WHERE document_id = 'legacy-r1'", [], |r| r.get(0)).unwrap();
        assert!(stored.contains("A gull landed on the rail."));
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM reader_text_pages WHERE document_id = 'legacy-r1'"), pages);
        // The blank article has nothing to read and is skipped.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM reader_documents WHERE id = 'legacy-r2'"), 0);
        // Highlights: both copied, the sentence one with its context.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM reader_word_log WHERE document_id = 'legacy-r1'"), 2);
        let (key, ctx): (String, Option<String>) = conn
            .query_row("SELECT word_key, context FROM reader_word_log WHERE id = 'legacy-hl-h1'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!((key.as_str(), ctx.as_deref()), ("gull", Some("A gull landed on the rail.")));
        // Source tables untouched.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM reading_documents"), 2);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM reading_highlights"), 2);
    }

    #[test]
    fn graded_essays_keep_their_feedback_and_ungraded_ones_stay_readable() {
        let conn = v063();
        run_migrations(&conn).unwrap();
        let (status, essay, overall, crit, fb, prompt, exam): (String, String, f64, String, String, String, String) = conn
            .query_row(
                "SELECT status, essay_text, overall_score, criteria_scores_json, feedback_json, prompt_json, exam_type FROM wp_sessions WHERE id = 'migrated-w1'",
                [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
            ).unwrap();
        assert_eq!(status, "graded");
        assert_eq!(essay, "I goed to the park.");
        assert_eq!(overall, 8.0, "78/100 on the 0-10 scale in half points");
        assert_eq!(exam, "general_essay");
        let crit: Value = serde_json::from_str(&crit).unwrap();
        assert_eq!(crit["Clarity"], 9.0);
        assert_eq!(crit["Task Completion"], 6.0);
        assert_eq!(crit["Grammar and Vocabulary"], 7.5);
        let fb: Value = serde_json::from_str(&fb).unwrap();
        assert_eq!(fb["summary"], "Good start");
        assert_eq!(fb["strengths"][0], "clear");
        assert_eq!(fb["error_highlights"][0]["text"], "goed");
        assert_eq!(fb["error_highlights"][0]["type"], "grammar", "style maps to grammar");
        let prompt: Value = serde_json::from_str(&prompt).unwrap();
        assert_eq!(prompt["source"], "migrated");
        assert_eq!(prompt["topic"], "My weekend");
        let rewritten: Option<String> = conn.query_row("SELECT ai_rewritten_version FROM wp_sessions WHERE id = 'migrated-w1'", [], |r| r.get(0)).unwrap();
        assert_eq!(rewritten.as_deref(), Some("I went to the park."));
        assert_eq!(count(&conn, "SELECT time_limit_seconds FROM wp_sessions WHERE id = 'migrated-w1'"), 1200);

        // The ungraded draft is a Reader text document; the empty one is skipped.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM reader_documents WHERE id = 'legacy-ws-w2'"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM wp_sessions WHERE id = 'migrated-w2'"), 0);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM reader_documents WHERE id = 'legacy-ws-w3'"), 0);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM writing_sessions"), 3, "source untouched");
    }

    #[test]
    fn running_the_copy_twice_never_duplicates() {
        let conn = v063();
        run_migrations(&conn).unwrap();
        let before = (
            count(&conn, "SELECT COUNT(*) FROM reader_documents"),
            count(&conn, "SELECT COUNT(*) FROM reader_text_pages"),
            count(&conn, "SELECT COUNT(*) FROM reader_word_log"),
            count(&conn, "SELECT COUNT(*) FROM wp_sessions"),
        );
        assert_eq!(before.3, 1);
        // Force a second run (as after a crash that lost the _migrations row).
        run_v041_legacy_content(&conn).unwrap();
        let after = (
            count(&conn, "SELECT COUNT(*) FROM reader_documents"),
            count(&conn, "SELECT COUNT(*) FROM reader_text_pages"),
            count(&conn, "SELECT COUNT(*) FROM reader_word_log"),
            count(&conn, "SELECT COUNT(*) FROM wp_sessions"),
        );
        assert_eq!(before, after);
    }

    #[test]
    fn a_database_with_no_legacy_rows_migrates_cleanly() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations(&conn).unwrap();
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM reader_documents"), 0);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM _migrations WHERE version = 'V041'"), 1);
    }
}
