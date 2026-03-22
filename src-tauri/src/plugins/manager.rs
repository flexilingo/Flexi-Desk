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

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::types::PluginManifest;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE plugins (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                version TEXT NOT NULL DEFAULT '0.0.1',
                description TEXT,
                author TEXT,
                homepage_url TEXT,
                wasm_path TEXT,
                permissions TEXT NOT NULL DEFAULT '[]',
                config TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'enabled',
                error_message TEXT,
                install_source TEXT NOT NULL DEFAULT 'local',
                installed_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .unwrap();
        conn
    }

    fn test_manifest(id: &str) -> PluginManifest {
        PluginManifest {
            id: id.to_string(),
            name: "Test Plugin".to_string(),
            version: "1.0.0".to_string(),
            description: Some("A test plugin".to_string()),
            author: Some("Tester".to_string()),
            homepage: None,
            min_flexidesk_version: None,
            entry_point: "plugin.wasm".to_string(),
            permissions: vec!["read".to_string()],
            config_schema: None,
            entry_points: super::super::types::PluginEntryPoints {
                init: "init".to_string(),
                run: "run".to_string(),
                cleanup: "cleanup".to_string(),
                on_config_change: None,
            },
        }
    }

    #[test]
    fn test_list_plugins_empty_returns_empty_vec() {
        let conn = setup();
        let plugins = list_plugins(&conn).unwrap();
        assert!(plugins.is_empty());
    }

    #[test]
    fn test_register_plugin_and_get_it_back() {
        let conn = setup();
        let manifest = test_manifest("my-plugin");
        let info = register_plugin(&conn, &manifest, "/path/to/plugin.wasm", "local").unwrap();
        assert_eq!(info.id, "my-plugin");
        assert_eq!(info.name, "Test Plugin");
        assert_eq!(info.version, "1.0.0");
    }

    #[test]
    fn test_list_plugins_returns_registered_plugin() {
        let conn = setup();
        register_plugin(&conn, &test_manifest("p1"), "/p1.wasm", "local").unwrap();
        let plugins = list_plugins(&conn).unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].id, "p1");
    }

    #[test]
    fn test_enable_plugin_sets_status_enabled() {
        let conn = setup();
        register_plugin(&conn, &test_manifest("p1"), "/p1.wasm", "local").unwrap();
        // Manually disable first
        conn.execute("UPDATE plugins SET status = 'disabled' WHERE id = 'p1'", [])
            .unwrap();
        let info = enable_plugin(&conn, "p1").unwrap();
        assert_eq!(info.status, "enabled");
        assert!(info.error_message.is_none());
    }

    #[test]
    fn test_disable_plugin_sets_status_disabled() {
        let conn = setup();
        register_plugin(&conn, &test_manifest("p1"), "/p1.wasm", "local").unwrap();
        let info = disable_plugin(&conn, "p1").unwrap();
        assert_eq!(info.status, "disabled");
    }

    #[test]
    fn test_uninstall_plugin_removes_it() {
        let conn = setup();
        register_plugin(&conn, &test_manifest("p1"), "/p1.wasm", "local").unwrap();
        uninstall_plugin(&conn, "p1").unwrap();
        let plugins = list_plugins(&conn).unwrap();
        assert!(plugins.is_empty());
    }

    #[test]
    fn test_update_config_stores_json() {
        let conn = setup();
        register_plugin(&conn, &test_manifest("p1"), "/p1.wasm", "local").unwrap();
        let config = serde_json::json!({"theme": "dark", "fontSize": 14});
        let info = update_config(&conn, "p1", &config).unwrap();
        assert_eq!(info.config["theme"], "dark");
        assert_eq!(info.config["fontSize"], 14);
    }

    #[test]
    fn test_set_error_updates_status_and_message() {
        let conn = setup();
        register_plugin(&conn, &test_manifest("p1"), "/p1.wasm", "local").unwrap();
        set_error(&conn, "p1", "init failed").unwrap();
        let info = get_plugin(&conn, "p1").unwrap();
        assert_eq!(info.status, "error");
        assert_eq!(info.error_message.as_deref(), Some("init failed"));
    }

    #[test]
    fn test_register_plugin_upserts_on_conflict() {
        let conn = setup();
        let manifest_v1 = test_manifest("p1");
        register_plugin(&conn, &manifest_v1, "/p1.wasm", "local").unwrap();
        // Register again with different version
        let mut manifest_v2 = test_manifest("p1");
        manifest_v2.version = "2.0.0".to_string();
        let info = register_plugin(&conn, &manifest_v2, "/p1.wasm", "local").unwrap();
        assert_eq!(info.version, "2.0.0");
        // Should still be only one plugin
        assert_eq!(list_plugins(&conn).unwrap().len(), 1);
    }
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
