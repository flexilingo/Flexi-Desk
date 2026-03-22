use rusqlite::Connection;

use super::types::*;

/// Get the current sync state (status, counts).
pub fn get_sync_state(conn: &Connection) -> Result<SyncState, String> {
    let pending_count = super::queue::pending_count(conn);

    let conflict_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_conflicts WHERE status = 'unresolved'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let last_synced: Option<String> = conn
        .query_row(
            "SELECT MAX(last_synced_at) FROM sync_metadata WHERE is_enabled = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(None);

    let status = if conflict_count > 0 {
        SyncStatus::Conflict
    } else if pending_count > 0 {
        SyncStatus::Idle
    } else {
        SyncStatus::Synced
    };

    Ok(SyncState {
        status,
        last_synced_at: last_synced,
        pending_count,
        conflict_count,
        error_message: None,
    })
}

/// Get sync configuration for all syncable tables.
pub fn get_sync_config(conn: &Connection) -> Result<Vec<SyncMetadata>, String> {
    // Ensure all syncable tables have metadata entries
    for table in SYNCABLE_TABLES {
        conn.execute(
            "INSERT OR IGNORE INTO sync_metadata (table_name) VALUES (?1)",
            rusqlite::params![table],
        )
        .map_err(|e| format!("Init metadata: {e}"))?;
    }

    let mut stmt = conn
        .prepare(
            "SELECT table_name, last_synced_at, last_cursor, is_enabled,
                    record_count, sync_direction, updated_at
             FROM sync_metadata ORDER BY table_name",
        )
        .map_err(|e| format!("Query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SyncMetadata {
                table_name: row.get(0)?,
                last_synced_at: row.get(1)?,
                last_cursor: row.get(2)?,
                is_enabled: row.get::<_, i32>(3)? != 0,
                record_count: row.get(4)?,
                sync_direction: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row: {e}"))?);
    }
    Ok(result)
}

/// Enable/disable sync for a table.
pub fn set_table_enabled(
    conn: &Connection,
    table_name: &str,
    enabled: bool,
    direction: Option<&str>,
) -> Result<SyncMetadata, String> {
    // Validate table name
    if !SYNCABLE_TABLES.contains(&table_name) {
        return Err(format!("Table '{table_name}' is not syncable"));
    }

    let dir = direction.unwrap_or("both");
    conn.execute(
        "INSERT INTO sync_metadata (table_name, is_enabled, sync_direction, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(table_name) DO UPDATE SET
            is_enabled = ?2, sync_direction = ?3, updated_at = datetime('now')",
        rusqlite::params![table_name, enabled as i32, dir],
    )
    .map_err(|e| format!("Set enabled: {e}"))?;

    conn.query_row(
        "SELECT table_name, last_synced_at, last_cursor, is_enabled,
                record_count, sync_direction, updated_at
         FROM sync_metadata WHERE table_name = ?1",
        rusqlite::params![table_name],
        |row| {
            Ok(SyncMetadata {
                table_name: row.get(0)?,
                last_synced_at: row.get(1)?,
                last_cursor: row.get(2)?,
                is_enabled: row.get::<_, i32>(3)? != 0,
                record_count: row.get(4)?,
                sync_direction: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )
    .map_err(|e| format!("Not found: {e}"))
}

/// Get unresolved conflicts.
pub fn get_conflicts(conn: &Connection) -> Result<Vec<SyncConflict>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, table_name, row_id, local_data, remote_data,
                    local_updated, remote_updated, status, created_at, resolved_at
             FROM sync_conflicts WHERE status = 'unresolved'
             ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SyncConflict {
                id: row.get(0)?,
                table_name: row.get(1)?,
                row_id: row.get(2)?,
                local_data: row.get(3)?,
                remote_data: row.get(4)?,
                local_updated: row.get(5)?,
                remote_updated: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                resolved_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("Query: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row: {e}"))?);
    }
    Ok(result)
}

/// Resolve a sync conflict.
#[allow(dead_code)]
pub fn resolve_conflict(
    conn: &Connection,
    conflict_id: &str,
    resolution: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_conflicts SET status = ?1, resolved_at = datetime('now') WHERE id = ?2",
        rusqlite::params![resolution, conflict_id],
    )
    .map_err(|e| format!("Resolve: {e}"))?;

    // If keeping remote, apply the remote data
    if resolution == "keep_remote" {
        let conflict: SyncConflict = conn
            .query_row(
                "SELECT id, table_name, row_id, local_data, remote_data,
                        local_updated, remote_updated, status, created_at, resolved_at
                 FROM sync_conflicts WHERE id = ?1",
                rusqlite::params![conflict_id],
                |row| {
                    Ok(SyncConflict {
                        id: row.get(0)?,
                        table_name: row.get(1)?,
                        row_id: row.get(2)?,
                        local_data: row.get(3)?,
                        remote_data: row.get(4)?,
                        local_updated: row.get(5)?,
                        remote_updated: row.get(6)?,
                        status: row.get(7)?,
                        created_at: row.get(8)?,
                        resolved_at: row.get(9)?,
                    })
                },
            )
            .map_err(|e| format!("Get conflict: {e}"))?;

        // Apply remote data — this would need table-specific logic
        // For now, we just mark it resolved
        let _ = conflict;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sync_queue (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                table_name TEXT NOT NULL, row_id TEXT NOT NULL,
                operation TEXT NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
                payload TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending','syncing','synced','failed','conflict')),
                retry_count INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                synced_at TEXT
            );
            CREATE TABLE sync_metadata (
                table_name TEXT PRIMARY KEY,
                last_synced_at TEXT, last_cursor TEXT,
                is_enabled INTEGER NOT NULL DEFAULT 0,
                record_count INTEGER NOT NULL DEFAULT 0,
                sync_direction TEXT NOT NULL DEFAULT 'both'
                               CHECK(sync_direction IN ('push','pull','both')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE sync_conflicts (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                table_name TEXT NOT NULL, row_id TEXT NOT NULL,
                local_data TEXT NOT NULL, remote_data TEXT NOT NULL,
                local_updated TEXT NOT NULL, remote_updated TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'unresolved'
                       CHECK(status IN ('unresolved','keep_local','keep_remote','merged')),
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                resolved_at TEXT
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_state_synced_when_empty() {
        let conn = setup();
        let state = get_sync_state(&conn).unwrap();
        assert_eq!(state.status, SyncStatus::Synced);
        assert_eq!(state.pending_count, 0);
        assert_eq!(state.conflict_count, 0);
    }

    #[test]
    fn test_state_idle_when_pending_exists() {
        let conn = setup();
        conn.execute(
            "INSERT INTO sync_queue (id, table_name, row_id, operation, payload)
             VALUES ('q1', 'vocabulary', 'r1', 'INSERT', '{}')",
            [],
        )
        .unwrap();
        let state = get_sync_state(&conn).unwrap();
        assert_eq!(state.status, SyncStatus::Idle);
        assert_eq!(state.pending_count, 1);
    }

    #[test]
    fn test_state_conflict_when_unresolved_conflict() {
        let conn = setup();
        conn.execute(
            "INSERT INTO sync_conflicts
             (id, table_name, row_id, local_data, remote_data, local_updated, remote_updated)
             VALUES ('c1', 'vocabulary', 'r1', '{}', '{}', datetime('now'), datetime('now'))",
            [],
        )
        .unwrap();
        let state = get_sync_state(&conn).unwrap();
        assert_eq!(state.status, SyncStatus::Conflict);
        assert_eq!(state.conflict_count, 1);
    }

    #[test]
    fn test_config_includes_all_syncable_tables() {
        let conn = setup();
        let config = get_sync_config(&conn).unwrap();
        let names: Vec<&str> = config.iter().map(|m| m.table_name.as_str()).collect();
        for table in SYNCABLE_TABLES {
            assert!(names.contains(table), "Missing table in config: {table}");
        }
    }

    #[test]
    fn test_set_table_enabled_persists() {
        let conn = setup();
        set_table_enabled(&conn, "vocabulary", false, None).unwrap();
        let config = get_sync_config(&conn).unwrap();
        let vocab = config.iter().find(|m| m.table_name == "vocabulary").unwrap();
        assert!(!vocab.is_enabled);

        set_table_enabled(&conn, "vocabulary", true, None).unwrap();
        let config = get_sync_config(&conn).unwrap();
        let vocab = config.iter().find(|m| m.table_name == "vocabulary").unwrap();
        assert!(vocab.is_enabled);
    }

    fn insert_conflict(conn: &Connection, id: &str, status: &str) {
        conn.execute(
            "INSERT INTO sync_conflicts
             (id, table_name, row_id, local_data, remote_data, local_updated, remote_updated, status)
             VALUES (?1, 'vocabulary', 'r1', '{\"a\":1}', '{\"a\":2}', datetime('now'), datetime('now'), ?2)",
            rusqlite::params![id, status],
        )
        .unwrap();
    }

    #[test]
    fn test_get_conflicts_returns_only_unresolved() {
        let conn = setup();
        insert_conflict(&conn, "c1", "unresolved");
        insert_conflict(&conn, "c2", "keep_local");
        let conflicts = get_conflicts(&conn).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].id, "c1");
        assert_eq!(conflicts[0].status, "unresolved");
    }

    #[test]
    fn test_resolve_conflict_keep_local_updates_status() {
        let conn = setup();
        insert_conflict(&conn, "c1", "unresolved");
        resolve_conflict(&conn, "c1", "keep_local").unwrap();
        let conflicts = get_conflicts(&conn).unwrap();
        assert_eq!(conflicts.len(), 0, "No unresolved conflicts should remain");
        let status: String = conn
            .query_row(
                "SELECT status FROM sync_conflicts WHERE id = 'c1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "keep_local");
    }

    #[test]
    fn test_resolve_conflict_keep_remote_updates_status() {
        let conn = setup();
        insert_conflict(&conn, "c1", "unresolved");
        resolve_conflict(&conn, "c1", "keep_remote").unwrap();
        let status: String = conn
            .query_row(
                "SELECT status FROM sync_conflicts WHERE id = 'c1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "keep_remote");
    }

    #[test]
    fn test_set_table_enabled_rejects_unknown_table() {
        let conn = setup();
        let result = set_table_enabled(&conn, "unknown_table", true, None);
        assert!(result.is_err());
    }
}
