use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardShortcut {
    pub id: String,
    pub action_id: String,
    pub label: String,
    pub description: Option<String>,
    pub category: String,
    pub key_binding: String,
    pub default_binding: String,
    pub is_global: bool,
    pub is_enabled: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutConflict {
    pub new_action_id: String,
    pub existing_action_id: String,
    pub existing_label: String,
    pub key_binding: String,
}
