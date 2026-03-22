use std::path::Path;

use super::types::PluginManifest;

#[cfg(test)]
mod tests {
    use super::*;

    fn write_manifest(dir: &std::path::Path, json: &str) {
        std::fs::write(dir.join("plugin.json"), json).unwrap();
    }

    fn valid_manifest_json(entry_point: &str) -> String {
        format!(
            r#"{{
                "id": "test-plugin",
                "name": "Test Plugin",
                "version": "1.0.0",
                "entry_point": "{entry_point}",
                "permissions": [],
                "entry_points": {{
                    "init": "init",
                    "run": "run",
                    "cleanup": "cleanup"
                }}
            }}"#
        )
    }

    #[test]
    fn test_parse_manifest_missing_plugin_json_returns_err() {
        let dir = tempfile::tempdir().unwrap();
        let result = parse_manifest(dir.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("plugin.json not found"));
    }

    #[test]
    fn test_parse_manifest_valid_returns_ok() {
        let dir = tempfile::tempdir().unwrap();
        // Create a dummy WASM file
        std::fs::write(dir.path().join("plugin.wasm"), b"").unwrap();
        write_manifest(dir.path(), &valid_manifest_json("plugin.wasm"));
        let result = parse_manifest(dir.path());
        assert!(result.is_ok());
        let manifest = result.unwrap();
        assert_eq!(manifest.id, "test-plugin");
        assert_eq!(manifest.name, "Test Plugin");
    }

    #[test]
    fn test_parse_manifest_empty_id_returns_err() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("plugin.wasm"), b"").unwrap();
        write_manifest(
            dir.path(),
            r#"{"id":"","name":"Test","version":"1.0","entry_point":"plugin.wasm",
               "permissions":[],"entry_points":{"init":"i","run":"r","cleanup":"c"}}"#,
        );
        let result = parse_manifest(dir.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Plugin ID is required"));
    }

    #[test]
    fn test_parse_manifest_empty_name_returns_err() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("plugin.wasm"), b"").unwrap();
        write_manifest(
            dir.path(),
            r#"{"id":"my-plugin","name":"","version":"1.0","entry_point":"plugin.wasm",
               "permissions":[],"entry_points":{"init":"i","run":"r","cleanup":"c"}}"#,
        );
        let result = parse_manifest(dir.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Plugin name is required"));
    }

    #[test]
    fn test_parse_manifest_missing_wasm_file_returns_err() {
        let dir = tempfile::tempdir().unwrap();
        // Do NOT create plugin.wasm
        write_manifest(dir.path(), &valid_manifest_json("plugin.wasm"));
        let result = parse_manifest(dir.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn test_parse_manifest_invalid_json_returns_err() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("plugin.json"), "not json").unwrap();
        let result = parse_manifest(dir.path());
        assert!(result.is_err());
    }
}

/// Parse a plugin manifest from a plugin.json file.
pub fn parse_manifest(plugin_dir: &Path) -> Result<PluginManifest, String> {
    let manifest_path = plugin_dir.join("plugin.json");
    if !manifest_path.exists() {
        return Err(format!(
            "plugin.json not found in {}",
            plugin_dir.display()
        ));
    }

    let content =
        std::fs::read_to_string(&manifest_path).map_err(|e| format!("Read manifest: {e}"))?;

    let manifest: PluginManifest =
        serde_json::from_str(&content).map_err(|e| format!("Parse manifest: {e}"))?;

    // Validate required fields
    if manifest.id.is_empty() {
        return Err("Plugin ID is required".to_string());
    }
    if manifest.name.is_empty() {
        return Err("Plugin name is required".to_string());
    }
    if manifest.entry_point.is_empty() {
        return Err("Entry point is required".to_string());
    }

    // Verify WASM file exists
    let wasm_path = plugin_dir.join(&manifest.entry_point);
    if !wasm_path.exists() {
        return Err(format!(
            "WASM file '{}' not found",
            manifest.entry_point
        ));
    }

    Ok(manifest)
}
