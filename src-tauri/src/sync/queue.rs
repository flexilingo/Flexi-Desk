use rusqlite::Connection;

use super::types::SyncQueueEntry;

/// Enqueue a local change for sync.
pub fn enqueue(
    conn: &Connection,
    table_name: &str,
    row_id: &str,
    operation: &str,
    payload: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sync_queue (id, table_name, row_id, operation, payload)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4)",
        rusqlite::params![table_name, row_id, operation, payload],
    )
    .map_err(|e| format!("Enqueue: {e}"))?;
    Ok(())
}

/// Get pending queue entries.
pub fn get_pending(
    conn: &Connection,
    status: Option<&str>,
) -> Result<Vec<SyncQueueEntry>, String> {
    let filter = status.unwrap_or("pending");
    let mut stmt = conn
        .prepare(
            "SELECT id, table_name, row_id, operation, payload, status,
                    retry_count, error_message, created_at, synced_at
             FROM sync_queue WHERE status = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Query: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![filter], map_queue_row)
        .map_err(|e| format!("Query: {e}"))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("Row: {e}"))?);
    }
    Ok(entries)
}

/// Mark queue entries as synced.
pub fn mark_synced(conn: &Connection, ids: &[String]) -> Result<(), String> {
    for id in ids {
        conn.execute(
            "UPDATE sync_queue SET status = 'synced', synced_at = datetime('now') WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| format!("Mark synced: {e}"))?;
    }
    Ok(())
}

/// Mark a queue entry as failed.
pub fn mark_failed(conn: &Connection, id: &str, error: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_queue SET status = 'failed', error_message = ?1, retry_count = retry_count + 1 WHERE id = ?2",
        rusqlite::params![error, id],
    )
    .map_err(|e| format!("Mark failed: {e}"))?;
    Ok(())
}

/// Get pending count.
pub fn pending_count(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'",
        [],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

/// Clear synced entries older than N days.
pub fn cleanup(conn: &Connection, days: i64) -> Result<i64, String> {
    let cutoff = format!("-{days} days");
    let count = conn
        .execute(
            "DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < datetime('now', ?1)",
            rusqlite::params![cutoff],
        )
        .map_err(|e| format!("Cleanup: {e}"))?;
    Ok(count as i64)
}

fn map_queue_row(row: &rusqlite::Row) -> rusqlite::Result<SyncQueueEntry> {
    Ok(SyncQueueEntry {
        id: row.get(0)?,
        table_name: row.get(1)?,
        row_id: row.get(2)?,
        operation: row.get(3)?,
        payload: row.get(4)?,
        status: row.get(5)?,
        retry_count: row.get(6)?,
        error_message: row.get(7)?,
        created_at: row.get(8)?,
        synced_at: row.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sync_queue (
                id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                table_name    TEXT NOT NULL,
                row_id        TEXT NOT NULL,
                operation     TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
                payload       TEXT NOT NULL DEFAULT '{}',
                status        TEXT NOT NULL DEFAULT 'pending'
                              CHECK(status IN ('pending', 'syncing', 'synced', 'failed', 'conflict')),
                retry_count   INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at    TEXT NOT NULL DEFAULT (datetime('now')),
                synced_at     TEXT
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_enqueue_adds_entry() {
        let conn = setup();
        enqueue(&conn, "vocabulary", "row-1", "INSERT", "{}").unwrap();
        let entries = get_pending(&conn, None).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].table_name, "vocabulary");
        assert_eq!(entries[0].row_id, "row-1");
        assert_eq!(entries[0].operation, "INSERT");
        assert_eq!(entries[0].status, "pending");
    }

    #[test]
    fn test_pending_count() {
        let conn = setup();
        enqueue(&conn, "decks", "r1", "INSERT", "{}").unwrap();
        enqueue(&conn, "decks", "r2", "UPDATE", "{}").unwrap();
        enqueue(&conn, "decks", "r3", "DELETE", "{}").unwrap();
        assert_eq!(pending_count(&conn), 3);
    }

    #[test]
    fn test_mark_synced_removes_from_pending() {
        let conn = setup();
        enqueue(&conn, "vocabulary", "r1", "INSERT", "{}").unwrap();
        let entries = get_pending(&conn, None).unwrap();
        let id = entries[0].id.clone();
        mark_synced(&conn, &[id]).unwrap();
        assert_eq!(pending_count(&conn), 0);
        assert_eq!(get_pending(&conn, None).unwrap().len(), 0);
    }

    #[test]
    fn test_mark_failed_sets_error_and_increments_retry() {
        let conn = setup();
        enqueue(&conn, "vocabulary", "r1", "INSERT", "{}").unwrap();
        let entries = get_pending(&conn, None).unwrap();
        let id = entries[0].id.clone();
        mark_failed(&conn, &id, "network timeout").unwrap();
        let failed = get_pending(&conn, Some("failed")).unwrap();
        assert_eq!(failed.len(), 1);
        assert_eq!(failed[0].error_message.as_deref(), Some("network timeout"));
        assert_eq!(failed[0].retry_count, 1);
    }

    #[test]
    fn test_get_pending_filters_by_status() {
        let conn = setup();
        enqueue(&conn, "decks", "r1", "INSERT", "{}").unwrap();
        enqueue(&conn, "decks", "r2", "INSERT", "{}").unwrap();
        let entries = get_pending(&conn, None).unwrap();
        let id = entries[0].id.clone();
        mark_synced(&conn, &[id]).unwrap();
        assert_eq!(get_pending(&conn, Some("pending")).unwrap().len(), 1);
        assert_eq!(get_pending(&conn, Some("synced")).unwrap().len(), 1);
    }

    #[test]
    fn test_cleanup_removes_old_synced() {
        let conn = setup();
        conn.execute(
            "INSERT INTO sync_queue (id, table_name, row_id, operation, payload, status, synced_at)
             VALUES ('old', 'decks', 'r1', 'INSERT', '{}', 'synced', datetime('now', '-30 days'))",
            [],
        )
        .unwrap();
        let removed = cleanup(&conn, 7).unwrap();
        assert_eq!(removed, 1);
    }

    #[test]
    fn test_cleanup_keeps_recent_synced() {
        let conn = setup();
        conn.execute(
            "INSERT INTO sync_queue (id, table_name, row_id, operation, payload, status, synced_at)
             VALUES ('new', 'decks', 'r1', 'INSERT', '{}', 'synced', datetime('now'))",
            [],
        )
        .unwrap();
        let removed = cleanup(&conn, 7).unwrap();
        assert_eq!(removed, 0);
    }

    #[test]
    fn test_all_operations_stored_correctly() {
        let conn = setup();
        enqueue(&conn, "vocabulary", "r1", "INSERT", r#"{"word":"test"}"#).unwrap();
        enqueue(&conn, "vocabulary", "r1", "UPDATE", r#"{"word":"updated"}"#).unwrap();
        enqueue(&conn, "vocabulary", "r1", "DELETE", "{}").unwrap();
        let entries = get_pending(&conn, None).unwrap();
        assert_eq!(entries.len(), 3);
        let ops: Vec<&str> = entries.iter().map(|e| e.operation.as_str()).collect();
        assert!(ops.contains(&"INSERT"));
        assert!(ops.contains(&"UPDATE"));
        assert!(ops.contains(&"DELETE"));
    }
}
