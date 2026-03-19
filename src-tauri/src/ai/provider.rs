use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Settings read from the local SQLite `settings` table.
pub struct AiSettings {
    pub provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
}

/// Read AI provider settings from the settings table.
/// Defaults to provider="ollama", model="llama3.2".
pub fn read_ai_settings(conn: &Connection) -> AiSettings {
    let get = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params![key],
            |row| row.get::<_, String>(0),
        )
        .ok()
    };

    let provider = get("ai_provider").unwrap_or_else(|| "ollama".to_string());
    let model = get("ai_model").unwrap_or_else(|| "llama3.2".to_string());

    let api_key = get(&format!("{}_api_key", provider));
    let base_url = get(&format!("{}_base_url", provider));

    AiSettings {
        provider,
        model,
        api_key,
        base_url,
    }
}

/// Send a chat completion request to Ollama's API.
/// Ollama runs locally on http://localhost:11434
pub async fn ollama_chat(
    model: &str,
    messages: Vec<ChatMessage>,
    base_url: Option<&str>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    json_mode: bool,
) -> Result<String, String> {
    let url = format!(
        "{}/api/chat",
        base_url.unwrap_or("http://localhost:11434")
    );

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": false,
    });

    if json_mode {
        body["format"] = serde_json::json!("json");
    }

    // Build options object for temperature and num_predict
    let mut options = serde_json::Map::new();
    if let Some(temp) = temperature {
        options.insert("temperature".to_string(), serde_json::json!(temp));
    }
    if let Some(max) = max_tokens {
        options.insert("num_predict".to_string(), serde_json::json!(max));
    }
    if !options.is_empty() {
        body["options"] = serde_json::Value::Object(options);
    }

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "OLLAMA_NOT_RUNNING".to_string()
            } else {
                format!("Ollama request failed: {e}. Is Ollama running?")
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Ollama error ({status}): {text}"));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {e}"))?;

    let content = json["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(content)
}

/// Send a chat completion to OpenAI-compatible API.
pub async fn openai_chat(
    model: &str,
    messages: Vec<ChatMessage>,
    api_key: &str,
    base_url: Option<&str>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    json_mode: bool,
) -> Result<String, String> {
    let url = format!(
        "{}/v1/chat/completions",
        base_url.unwrap_or("https://api.openai.com")
    );

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
    });

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }
    if let Some(max) = max_tokens {
        body["max_tokens"] = serde_json::json!(max);
    }
    if json_mode {
        body["response_format"] = serde_json::json!({"type": "json_object"});
    }

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI error ({status}): {text}"));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {e}"))?;

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(content)
}

/// Send a chat completion request to Anthropic's API.
pub async fn anthropic_chat(
    model: &str,
    messages: Vec<ChatMessage>,
    api_key: &str,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    _json_mode: bool,
) -> Result<String, String> {
    let url = "https://api.anthropic.com/v1/messages";

    let system_msg = messages
        .iter()
        .find(|m| m.role == "system")
        .map(|m| m.content.clone());

    let non_system: Vec<_> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content,
            })
        })
        .collect();

    let effective_max_tokens = max_tokens.unwrap_or(1024);

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": effective_max_tokens,
        "messages": non_system,
    });

    if let Some(sys) = system_msg {
        body["system"] = serde_json::json!(sys);
    }
    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic error ({status}): {text}"));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Anthropic response: {e}"))?;

    let content = json["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(content)
}

/// Dispatch to the right provider based on provider name.
pub async fn chat_completion(
    provider: &str,
    model: &str,
    messages: Vec<ChatMessage>,
    api_key: Option<&str>,
    base_url: Option<&str>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    json_mode: bool,
) -> Result<String, String> {
    match provider {
        "ollama" => {
            ollama_chat(model, messages, base_url, temperature, max_tokens, json_mode).await
        }
        "openai" => {
            let key = api_key.ok_or("OpenAI API key not configured")?;
            openai_chat(model, messages, key, base_url, temperature, max_tokens, json_mode).await
        }
        "anthropic" => {
            let key = api_key.ok_or("Anthropic API key not configured")?;
            anthropic_chat(model, messages, key, temperature, max_tokens, json_mode).await
        }
        _ => Err(format!("Unsupported provider: {provider}")),
    }
}
