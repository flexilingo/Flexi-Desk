mod schema;

use std::path::Path;

use rusqlite::Connection;

use schema::run_migrations;

pub fn init_database(app_data_dir: &Path) -> Result<Connection, String> {
    let db_path = app_data_dir.join("flexidesk.db");

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database at {}: {e}", db_path.display()))?;

    // Enable WAL mode for better concurrent read performance
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {e}"))?;

    // Enable foreign keys
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("Failed to enable foreign keys: {e}"))?;

    run_migrations(&conn)?;

    Ok(conn)
}
