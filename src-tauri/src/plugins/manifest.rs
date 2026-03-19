use std::path::Path;

use super::types::PluginManifest;

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
