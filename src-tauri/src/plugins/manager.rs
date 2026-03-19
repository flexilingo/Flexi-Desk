use rusqlite::Connection;

use super::types::PluginInfo;

/// List all installed plugins from the database.
pub fn list_plugins(conn: &Connection) -> Result<Vec<PluginInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, version, description, author, homepage_url,
                    permissions, config, status, error_message, install_source,
                    installed_at, updated_at
             FROM plugins ORDER BY name",
        )
        .map_err(|e| format!("Query: {e}"))?;

    let rows = stmt
        .query_map([], map_plugin_row)
        .map_err(|e| format!("Query: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row: {e}"))?);
    }
    Ok(result)
}

/// Register a plugin in the database.
pub fn register_plugin(
    conn: &Connection,
    manifest: &super::types::PluginManifest,
    wasm_path: &str,
    install_source: &str,
) -> Result<PluginInfo, String> {
    let permissions_json =
        serde_json::to_string(&manifest.permissions).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT INTO plugins (id, name, version, description, author, homepage_url, wasm_path, permissions, install_source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            name = ?2, version = ?3, description = ?4, author = ?5,
            homepage_url = ?6, wasm_path = ?7, permissions = ?8,
            updated_at = datetime('now')",
        rusqlite::params![
            manifest.id,
            manifest.name,
            manifest.version,
            manifest.description,
            manifest.author,
            manifest.homepage,
            wasm_path,
            permissions_json,
            install_source,
        ],
    )
    .map_err(|e| format!("Register: {e}"))?;

    get_plugin(conn, &manifest.id)
}

/// Get a plugin by ID.
pub fn get_plugin(conn: &Connection, plugin_id: &str) -> Result<PluginInfo, String> {
    conn.query_row(
        "SELECT id, name, version, description, author, homepage_url,
                permissions, config, status, error_message, install_source,
                installed_at, updated_at
         FROM plugins WHERE id = ?1",
        rusqlite::params![plugin_id],
        map_plugin_row,
    )
    .map_err(|e| format!("Not found: {e}"))
}

/// Enable a plugin.
pub fn enable_plugin(conn: &Connection, plugin_id: &str) -> Result<PluginInfo, String> {
    conn.execute(
        "UPDATE plugins SET status = 'enabled', error_message = NULL, updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![plugin_id],
    )
    .map_err(|e| format!("Enable: {e}"))?;
    get_plugin(conn, plugin_id)
}

/// Disable a plugin.
pub fn disable_plugin(conn: &Connection, plugin_id: &str) -> Result<PluginInfo, String> {
    conn.execute(
        "UPDATE plugins SET status = 'disabled', updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![plugin_id],
    )
    .map_err(|e| format!("Disable: {e}"))?;
    get_plugin(conn, plugin_id)
}

/// Uninstall a plugin.
pub fn uninstall_plugin(conn: &Connection, plugin_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM plugins WHERE id = ?1",
        rusqlite::params![plugin_id],
    )
    .map_err(|e| format!("Uninstall: {e}"))?;
    Ok(())
}

/// Update plugin config.
pub fn update_config(
    conn: &Connection,
    plugin_id: &str,
    config: &serde_json::Value,
) -> Result<PluginInfo, String> {
    let config_str = serde_json::to_string(config).unwrap_or_else(|_| "{}".to_string());
    conn.execute(
        "UPDATE plugins SET config = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![config_str, plugin_id],
    )
    .map_err(|e| format!("Config update: {e}"))?;
    get_plugin(conn, plugin_id)
}

/// Set error status on a plugin.
pub fn set_error(conn: &Connection, plugin_id: &str, error: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE plugins SET status = 'error', error_message = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![error, plugin_id],
    )
    .map_err(|e| format!("Set error: {e}"))?;
    Ok(())
}

fn map_plugin_row(row: &rusqlite::Row) -> rusqlite::Result<PluginInfo> {
    let perms_str: String = row.get(6)?;
    let permissions: Vec<String> =
        serde_json::from_str(&perms_str).unwrap_or_default();
    let config_str: String = row.get(7)?;
    let config: serde_json::Value =
        serde_json::from_str(&config_str).unwrap_or(serde_json::Value::Object(Default::default()));

    Ok(PluginInfo {
        id: row.get(0)?,
        name: row.get(1)?,
        version: row.get(2)?,
        description: row.get(3)?,
        author: row.get(4)?,
        homepage_url: row.get(5)?,
        permissions,
        config,
        status: row.get(8)?,
        error_message: row.get(9)?,
        install_source: row.get(10)?,
        installed_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}
