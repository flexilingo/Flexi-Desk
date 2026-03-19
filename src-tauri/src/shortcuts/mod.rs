pub mod defaults;
pub mod types;

use rusqlite::Connection;
use types::{KeyboardShortcut, ShortcutConflict};

/// Seed default shortcuts into the DB if the table is empty.
pub fn seed_defaults(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM keyboard_shortcuts", [], |row| row.get(0))
        .unwrap_or(0);

    if count > 0 {
        return Ok(());
    }

    for def in defaults::DEFAULT_SHORTCUTS {
        conn.execute(
            "INSERT INTO keyboard_shortcuts (id, action_id, label, description, category, key_binding, default_binding, is_global)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?5, ?6)",
            rusqlite::params![
                def.action_id,
                def.label,
                def.description,
                def.category,
                def.default_binding,
                def.is_global as i32,
            ],
        )
        .map_err(|e| format!("Seed shortcut: {e}"))?;
    }
    Ok(())
}

/// List all shortcuts, optionally filtered by category.
pub fn list_shortcuts(
    conn: &Connection,
    category: Option<&str>,
) -> Result<Vec<KeyboardShortcut>, String> {
    let sql = if category.is_some() {
        "SELECT id, action_id, label, description, category, key_binding, default_binding, is_global, is_enabled, updated_at
         FROM keyboard_shortcuts WHERE category = ?1 ORDER BY action_id"
    } else {
        "SELECT id, action_id, label, description, category, key_binding, default_binding, is_global, is_enabled, updated_at
         FROM keyboard_shortcuts ORDER BY category, action_id"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| format!("Query: {e}"))?;

    let rows = if let Some(cat) = category {
        stmt.query_map(rusqlite::params![cat], map_shortcut_row)
    } else {
        stmt.query_map([], map_shortcut_row)
    }
    .map_err(|e| format!("Query: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row: {e}"))?);
    }
    Ok(result)
}

/// Update a shortcut's key binding.
pub fn update_binding(
    conn: &Connection,
    action_id: &str,
    new_binding: &str,
) -> Result<KeyboardShortcut, String> {
    conn.execute(
        "UPDATE keyboard_shortcuts SET key_binding = ?1, updated_at = datetime('now') WHERE action_id = ?2",
        rusqlite::params![new_binding, action_id],
    )
    .map_err(|e| format!("Update: {e}"))?;

    get_by_action_id(conn, action_id)
}

/// Check for conflicts with the given binding.
pub fn check_conflict(
    conn: &Connection,
    action_id: &str,
    binding: &str,
) -> Result<Option<ShortcutConflict>, String> {
    let result = conn.query_row(
        "SELECT action_id, label, key_binding FROM keyboard_shortcuts
         WHERE key_binding = ?1 AND action_id != ?2 AND is_enabled = 1",
        rusqlite::params![binding, action_id],
        |row| {
            Ok(ShortcutConflict {
                new_action_id: action_id.to_string(),
                existing_action_id: row.get(0)?,
                existing_label: row.get(1)?,
                key_binding: row.get(2)?,
            })
        },
    );

    match result {
        Ok(conflict) => Ok(Some(conflict)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Conflict check: {e}")),
    }
}

/// Reset a single shortcut to its default binding.
pub fn reset_shortcut(conn: &Connection, action_id: &str) -> Result<KeyboardShortcut, String> {
    conn.execute(
        "UPDATE keyboard_shortcuts SET key_binding = default_binding, updated_at = datetime('now') WHERE action_id = ?1",
        rusqlite::params![action_id],
    )
    .map_err(|e| format!("Reset: {e}"))?;

    get_by_action_id(conn, action_id)
}

/// Reset all shortcuts to their defaults.
pub fn reset_all(conn: &Connection) -> Result<Vec<KeyboardShortcut>, String> {
    conn.execute(
        "UPDATE keyboard_shortcuts SET key_binding = default_binding, updated_at = datetime('now')",
        [],
    )
    .map_err(|e| format!("Reset all: {e}"))?;

    list_shortcuts(conn, None)
}

/// Enable or disable a shortcut.
pub fn toggle_shortcut(
    conn: &Connection,
    action_id: &str,
    enabled: bool,
) -> Result<KeyboardShortcut, String> {
    conn.execute(
        "UPDATE keyboard_shortcuts SET is_enabled = ?1, updated_at = datetime('now') WHERE action_id = ?2",
        rusqlite::params![enabled as i32, action_id],
    )
    .map_err(|e| format!("Toggle: {e}"))?;

    get_by_action_id(conn, action_id)
}

/// Get enabled global shortcuts (for registration with OS).
pub fn get_enabled_globals(conn: &Connection) -> Result<Vec<KeyboardShortcut>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, action_id, label, description, category, key_binding, default_binding, is_global, is_enabled, updated_at
             FROM keyboard_shortcuts WHERE is_global = 1 AND is_enabled = 1",
        )
        .map_err(|e| format!("Query: {e}"))?;

    let rows = stmt
        .query_map([], map_shortcut_row)
        .map_err(|e| format!("Query: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row: {e}"))?);
    }
    Ok(result)
}

// ── Internal ─────────────────────────────────────────────

fn get_by_action_id(conn: &Connection, action_id: &str) -> Result<KeyboardShortcut, String> {
    conn.query_row(
        "SELECT id, action_id, label, description, category, key_binding, default_binding, is_global, is_enabled, updated_at
         FROM keyboard_shortcuts WHERE action_id = ?1",
        rusqlite::params![action_id],
        map_shortcut_row,
    )
    .map_err(|e| format!("Not found: {e}"))
}

fn map_shortcut_row(row: &rusqlite::Row) -> rusqlite::Result<KeyboardShortcut> {
    Ok(KeyboardShortcut {
        id: row.get(0)?,
        action_id: row.get(1)?,
        label: row.get(2)?,
        description: row.get(3)?,
        category: row.get(4)?,
        key_binding: row.get(5)?,
        default_binding: row.get(6)?,
        is_global: row.get::<_, i32>(7)? != 0,
        is_enabled: row.get::<_, i32>(8)? != 0,
        updated_at: row.get(9)?,
    })
}
