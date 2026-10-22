//! SQLite storage for Writing practice sessions kept on this computer.
//! Every function takes `&Connection`, so the commands stay thin and tests use memory databases.
//! A session row is returned in the website's `WritingSession` shape.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde_json::{json, Value};

pub const MIGRATION_SQL: &str = "
    CREATE TABLE IF NOT EXISTS wp_sessions (
        id                    TEXT PRIMARY KEY,
        exam_type             TEXT NOT NULL,
        status                TEXT NOT NULL DEFAULT 'active'
                              CHECK(status IN ('active', 'submitted', 'graded', 'cancelled')),
        prompt_json           TEXT NOT NULL,
        essay_text            TEXT,
        word_count            INTEGER NOT NULL DEFAULT 0,
        time_limit_seconds    INTEGER,
        time_spent_seconds    INTEGER NOT NULL DEFAULT 0,
        timer_enabled         INTEGER NOT NULL DEFAULT 1,
        overall_score         REAL,
        criteria_scores_json  TEXT,
        feedback_json         TEXT,
        ai_rewritten_version  TEXT,
        started_at            TEXT NOT NULL,
        submitted_at          TEXT,
        graded_at             TEXT,
        created_at            TEXT NOT NULL,
        updated_at            TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wp_sessions_status  ON wp_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_wp_sessions_created ON wp_sessions(created_at);
";

const COLS: &str = "id, exam_type, status, prompt_json, essay_text, word_count, time_limit_seconds, \
    time_spent_seconds, timer_enabled, overall_score, criteria_scores_json, feedback_json, \
    ai_rewritten_version, started_at, submitted_at, graded_at, created_at";

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn parse(s: Option<String>) -> Value {
    s.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null)
}

fn row_to_session(r: &Row) -> rusqlite::Result<Value> {
    let prompt = parse(r.get(3)?);
    Ok(json!({
        "id": r.get::<_, String>(0)?,
        "user_id": "local",
        "prompt_id": prompt.get("id").cloned().unwrap_or(Value::Null),
        "exam_type": r.get::<_, String>(1)?,
        "status": r.get::<_, String>(2)?,
        "essay_text": r.get::<_, Option<String>>(4)?,
        "word_count": r.get::<_, i64>(5)?,
        "time_limit_seconds": r.get::<_, Option<i64>>(6)?,
        "time_spent_seconds": r.get::<_, i64>(7)?,
        "timer_enabled": r.get::<_, i64>(8)? != 0,
        "overall_score": r.get::<_, Option<f64>>(9)?,
        "criteria_scores": parse(r.get(10)?),
        "feedback": parse(r.get(11)?),
        "ai_rewritten_version": r.get::<_, Option<String>>(12)?,
        "started_at": r.get::<_, String>(13)?,
        "submitted_at": r.get::<_, Option<String>>(14)?,
        "graded_at": r.get::<_, Option<String>>(15)?,
        "created_at": r.get::<_, String>(16)?,
        "prompt": prompt,
    }))
}

pub fn get_session(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    conn.query_row(
        &format!("SELECT {COLS} FROM wp_sessions WHERE id = ?1"),
        params![id],
        row_to_session,
    )
    .optional()
    .map_err(|e| format!("SESSION_READ_FAILED: {e}"))
}

pub fn create_session(
    conn: &Connection,
    exam_type: &str,
    prompt: &Value,
    timer_enabled: bool,
    time_limit_seconds: Option<i64>,
) -> Result<Value, String> {
    let id = format!("local-{}", uuid::Uuid::new_v4().simple());
    let t = now();
    conn.execute(
        "INSERT INTO wp_sessions (id, exam_type, status, prompt_json, time_limit_seconds, timer_enabled,
            started_at, created_at, updated_at)
         VALUES (?1, ?2, 'active', ?3, ?4, ?5, ?6, ?6, ?6)",
        params![
            id,
            exam_type,
            prompt.to_string(),
            if timer_enabled { time_limit_seconds } else { None },
            timer_enabled as i64,
            t
        ],
    )
    .map_err(|e| format!("SESSION_CREATION_FAILED: {e}"))?;
    get_session(conn, &id)?.ok_or_else(|| "SESSION_CREATION_FAILED".to_string())
}

/// The most recent session still being written.
pub fn get_active(conn: &Connection) -> Result<Option<Value>, String> {
    conn.query_row(
        &format!("SELECT {COLS} FROM wp_sessions WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"),
        [],
        row_to_session,
    )
    .optional()
    .map_err(|e| format!("SESSION_READ_FAILED: {e}"))
}

pub fn save_draft(conn: &Connection, id: &str, text: &str, words: i64, spent: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE wp_sessions SET essay_text = ?2, word_count = ?3, time_spent_seconds = ?4, updated_at = ?5
         WHERE id = ?1 AND status = 'active'",
        params![id, text, words.max(0), spent.max(0), now()],
    )
    .map_err(|e| format!("SAVE_DRAFT_FAILED: {e}"))?;
    Ok(())
}

pub fn cancel(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE wp_sessions SET status = 'cancelled', updated_at = ?2 WHERE id = ?1 AND status = 'active'",
        params![id, now()],
    )
    .map_err(|e| format!("CANCEL_SESSION_FAILED: {e}"))?;
    Ok(())
}

/// active -> submitted, keeping the essay. Fails when the session is not active.
pub fn mark_submitted(conn: &Connection, id: &str, text: &str, words: i64, spent: i64) -> Result<(), String> {
    let t = now();
    let n = conn
        .execute(
            "UPDATE wp_sessions SET status = 'submitted', essay_text = ?2, word_count = ?3,
                time_spent_seconds = ?4, submitted_at = ?5, updated_at = ?5
             WHERE id = ?1 AND status = 'active'",
            params![id, text, words.max(0), spent.max(0), t],
        )
        .map_err(|e| format!("WRITING_GRADING_FAILED: {e}"))?;
    if n == 0 {
        return Err(if get_session(conn, id)?.is_some() {
            "WRITING_SESSION_ALREADY_SUBMITTED".to_string()
        } else {
            "WRITING_SESSION_NOT_FOUND".to_string()
        });
    }
    Ok(())
}

pub fn save_graded(conn: &Connection, id: &str, graded: &Value) -> Result<(), String> {
    let t = now();
    conn.execute(
        "UPDATE wp_sessions SET status = 'graded', overall_score = ?2, criteria_scores_json = ?3,
            feedback_json = ?4, ai_rewritten_version = ?5, graded_at = ?6, updated_at = ?6
         WHERE id = ?1",
        params![
            id,
            graded["overall_score"].as_f64(),
            graded["criteria_scores"].to_string(),
            graded["feedback"].to_string(),
            graded["ai_rewritten_version"].as_str().unwrap_or(""),
            t
        ],
    )
    .map_err(|e| format!("WRITING_GRADING_FAILED: {e}"))?;
    Ok(())
}

/// Grading failed: back to writing, essay kept, so the user can retry.
pub fn revert_to_active(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE wp_sessions SET status = 'active', submitted_at = NULL, updated_at = ?2
         WHERE id = ?1 AND status = 'submitted'",
        params![id, now()],
    )
    .map_err(|e| format!("SESSION_READ_FAILED: {e}"))?;
    Ok(())
}

/// Submitted and graded sessions, newest first, like the server's `history`.
/// `all_total` counts every session of any status (the stats card's "total sessions").
pub fn history(conn: &Connection, limit: i64, offset: i64, exam_type: Option<&str>) -> Result<Value, String> {
    let filter = exam_type.filter(|e| !e.is_empty());
    let (where_sql, total_sql) = match filter {
        Some(_) => (
            "status IN ('submitted','graded') AND exam_type = ?3",
            "SELECT COUNT(*) FROM wp_sessions WHERE status IN ('submitted','graded') AND exam_type = ?1",
        ),
        None => (
            "status IN ('submitted','graded') AND ?3 IS NULL",
            "SELECT COUNT(*) FROM wp_sessions WHERE status IN ('submitted','graded') AND ?1 IS NULL",
        ),
    };
    let sql = format!(
        "SELECT {COLS} FROM wp_sessions WHERE {where_sql}
         ORDER BY COALESCE(submitted_at, created_at) DESC LIMIT ?1 OFFSET ?2"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("SESSION_READ_FAILED: {e}"))?;
    let rows = stmt
        .query_map(params![limit.clamp(1, 1000), offset.max(0), filter], row_to_session)
        .map_err(|e| format!("SESSION_READ_FAILED: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("SESSION_READ_FAILED: {e}"))?;
    let total: i64 = conn
        .query_row(total_sql, params![filter], |r| r.get(0))
        .map_err(|e| format!("SESSION_READ_FAILED: {e}"))?;
    let all_total: i64 = conn
        .query_row("SELECT COUNT(*) FROM wp_sessions", [], |r| r.get(0))
        .map_err(|e| format!("SESSION_READ_FAILED: {e}"))?;
    Ok(json!({ "sessions": rows, "total": total, "all_total": all_total }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::run_migrations;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    fn prompt() -> Value {
        json!({"id": "p1", "topic": "Topic", "prompt_text": "Write.", "supplementary_data": {"chart_description": "Bars"}})
    }

    fn graded() -> Value {
        json!({"overall_score": 7.0, "criteria_scores": {"Task Response": 7}, "feedback": {"summary": "ok"}, "ai_rewritten_version": "better"})
    }

    #[test]
    fn a_new_session_is_active_with_the_web_shape() {
        let c = db();
        let s = create_session(&c, "ielts_task2", &prompt(), true, Some(2400)).unwrap();
        assert!(s["id"].as_str().unwrap().starts_with("local-"));
        assert_eq!(s["status"], "active");
        assert_eq!(s["timer_enabled"], true);
        assert_eq!(s["time_limit_seconds"], 2400);
        assert_eq!(s["prompt"]["topic"], "Topic");
        assert_eq!(s["prompt_id"], "p1");
        assert_eq!(s["word_count"], 0);
        let off = create_session(&c, "celpip", &prompt(), false, Some(1620)).unwrap();
        assert!(off["time_limit_seconds"].is_null());
        assert_eq!(off["timer_enabled"], false);
    }

    #[test]
    fn draft_saves_and_resume_finds_the_active_session() {
        let c = db();
        let s = create_session(&c, "celpip", &prompt(), true, Some(60)).unwrap();
        let id = s["id"].as_str().unwrap();
        save_draft(&c, id, "Half an essay", 3, 41).unwrap();
        let active = get_active(&c).unwrap().unwrap();
        assert_eq!(active["id"], s["id"]);
        assert_eq!(active["essay_text"], "Half an essay");
        assert_eq!(active["word_count"], 3);
        assert_eq!(active["time_spent_seconds"], 41);
        cancel(&c, id).unwrap();
        assert!(get_active(&c).unwrap().is_none());
        // a cancelled session no longer takes drafts
        save_draft(&c, id, "late", 1, 1).unwrap();
        assert_eq!(get_session(&c, id).unwrap().unwrap()["essay_text"], "Half an essay");
    }

    #[test]
    fn submit_grade_and_double_submit() {
        let c = db();
        let id = create_session(&c, "ielts_task2", &prompt(), true, None).unwrap()["id"].as_str().unwrap().to_string();
        mark_submitted(&c, &id, "My essay", 2, 90).unwrap();
        assert_eq!(mark_submitted(&c, &id, "again", 2, 90).unwrap_err(), "WRITING_SESSION_ALREADY_SUBMITTED");
        assert_eq!(mark_submitted(&c, "nope", "x", 1, 1).unwrap_err(), "WRITING_SESSION_NOT_FOUND");
        save_graded(&c, &id, &graded()).unwrap();
        let s = get_session(&c, &id).unwrap().unwrap();
        assert_eq!(s["status"], "graded");
        assert_eq!(s["overall_score"], 7.0);
        assert_eq!(s["criteria_scores"]["Task Response"], 7);
        assert_eq!(s["feedback"]["summary"], "ok");
        assert_eq!(s["ai_rewritten_version"], "better");
        assert!(s["graded_at"].is_string());
    }

    #[test]
    fn a_failed_grading_returns_to_writing_with_the_essay_kept() {
        let c = db();
        let id = create_session(&c, "celpip", &prompt(), true, None).unwrap()["id"].as_str().unwrap().to_string();
        mark_submitted(&c, &id, "Kept essay text", 3, 10).unwrap();
        revert_to_active(&c, &id).unwrap();
        let s = get_session(&c, &id).unwrap().unwrap();
        assert_eq!(s["status"], "active");
        assert_eq!(s["essay_text"], "Kept essay text");
        assert!(s["submitted_at"].is_null());
    }

    #[test]
    fn history_lists_only_submitted_and_graded_newest_first() {
        let c = db();
        let mk = |exam: &str, text: &str| {
            let id = create_session(&c, exam, &prompt(), true, None).unwrap()["id"].as_str().unwrap().to_string();
            mark_submitted(&c, &id, text, 2, 5).unwrap();
            id
        };
        let a = mk("celpip", "first one");
        std::thread::sleep(std::time::Duration::from_millis(5));
        let b = mk("ielts_task2", "second one");
        save_graded(&c, &b, &graded()).unwrap();
        create_session(&c, "celpip", &prompt(), true, None).unwrap(); // still active
        let h = history(&c, 20, 0, None).unwrap();
        assert_eq!(h["total"], 2);
        assert_eq!(h["all_total"], 3);
        assert_eq!(h["sessions"][0]["id"], b);
        assert_eq!(h["sessions"][1]["id"], a);
        let only = history(&c, 20, 0, Some("celpip")).unwrap();
        assert_eq!(only["total"], 1);
        assert_eq!(only["sessions"][0]["id"], a);
        assert_eq!(history(&c, 1, 1, None).unwrap()["sessions"][0]["id"], a);
    }
}
