use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub digest: String,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub connected: bool,
    pub version: Option<String>,
    pub models: Vec<OllamaModel>,
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaPullProgress {
    pub model_name: String,
    pub status: String,
    pub digest: Option<String>,
    pub total: Option<u64>,
    pub completed: Option<u64>,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaInstallStatus {
    pub is_installed: bool,
    pub binary_path: Option<String>,
    pub is_managed: bool,
    pub is_system_install: bool,
    pub is_serve_running: bool,
    pub platform: String,
    pub arch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaInstallProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f64,
    pub status: String,
}
