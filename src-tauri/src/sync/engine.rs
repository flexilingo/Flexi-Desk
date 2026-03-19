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
