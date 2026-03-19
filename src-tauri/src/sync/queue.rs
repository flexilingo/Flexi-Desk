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
