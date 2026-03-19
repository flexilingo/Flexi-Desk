use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub homepage: Option<String>,
    pub min_flexidesk_version: Option<String>,
    pub entry_point: String,
    pub permissions: Vec<String>,
    pub config_schema: Option<serde_json::Value>,
    pub entry_points: PluginEntryPoints,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginEntryPoints {
    pub init: String,
    pub run: String,
    pub cleanup: String,
    pub on_config_change: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub homepage_url: Option<String>,
    pub permissions: Vec<String>,
    pub config: serde_json::Value,
    pub status: String,
    pub error_message: Option<String>,
    pub install_source: String,
    pub installed_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub download_url: String,
    pub homepage: Option<String>,
    pub downloads: i64,
    pub rating: f64,
    pub permissions: Vec<String>,
    pub min_flexidesk_version: String,
}
