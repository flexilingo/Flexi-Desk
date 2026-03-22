use futures_util::StreamExt;
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
        .map_err(|e| {
            if e.is_connect() && url.contains("localhost") {
                "AI service is not running. Please start Ollama or check your AI provider settings.".to_string()
            } else {
                format!("OpenAI request failed: {e}")
            }
        })?;

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

// ---------------------------------------------------------------------------
// Streaming variants
// ---------------------------------------------------------------------------

/// Stream a chat completion from Ollama (NDJSON format).
pub async fn ollama_chat_stream(
    base_url: &str,
    model: &str,
    messages: &[ChatMessage],
    temperature: Option<f64>,
    on_token: impl Fn(&str),
) -> Result<String, String> {
    let url = format!("{base_url}/api/chat");

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });

    if let Some(temp) = temperature {
        let mut opts = serde_json::Map::new();
        opts.insert("temperature".to_string(), serde_json::json!(temp));
        body["options"] = serde_json::Value::Object(opts);
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
                format!("Ollama stream request failed: {e}")
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Ollama error ({status}): {text}"));
    }

    let mut full_response = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Ollama stream read error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=newline_pos).collect();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(content) = json["message"]["content"].as_str() {
                    if !content.is_empty() {
                        on_token(content);
                        full_response.push_str(content);
                    }
                }
                if json["done"].as_bool() == Some(true) {
                    return Ok(full_response);
                }
            }
        }
    }

    Ok(full_response)
}

/// Stream a chat completion from an OpenAI-compatible API (SSE format).
pub async fn openai_chat_stream(
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    on_token: impl Fn(&str),
) -> Result<String, String> {
    let url = format!(
        "{}/v1/chat/completions",
        base_url.trim_end_matches('/')
    );

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }
    if let Some(max) = max_tokens {
        body["max_tokens"] = serde_json::json!(max);
    }

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() && url.contains("localhost") {
                "AI service is not running. Please start Ollama or check your AI provider settings.".to_string()
            } else {
                format!("OpenAI stream request failed: {e}")
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI error ({status}): {text}"));
    }

    let mut full_response = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("OpenAI stream read error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=newline_pos).collect();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                let data = data.trim();
                if data == "[DONE]" {
                    return Ok(full_response);
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                        if !content.is_empty() {
                            on_token(content);
                            full_response.push_str(content);
                        }
                    }
                }
            }
        }
    }

    Ok(full_response)
}

/// Stream a chat completion from Anthropic's Messages API (SSE format).
pub async fn anthropic_chat_stream(
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    system_message: Option<&str>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    on_token: impl Fn(&str),
) -> Result<String, String> {
    let url = format!("{base_url}/messages");

    let non_system: Vec<serde_json::Value> = messages
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
        "stream": true,
    });

    if let Some(sys) = system_message {
        body["system"] = serde_json::json!(sys);
    }
    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic stream request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic error ({status}): {text}"));
    }

    let mut full_response = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();
    let mut current_event = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Anthropic stream read error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=newline_pos).collect();
            let line = line.trim();

            if line.is_empty() {
                continue;
            }

            if let Some(event_type) = line.strip_prefix("event: ") {
                current_event = event_type.trim().to_string();
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                if current_event == "message_stop" {
                    return Ok(full_response);
                }

                if current_event == "content_block_delta" {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data.trim()) {
                        if let Some(text) = json["delta"]["text"].as_str() {
                            if !text.is_empty() {
                                on_token(text);
                                full_response.push_str(text);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(full_response)
}

/// Unified streaming dispatcher — routes to the correct provider.
pub async fn chat_completion_stream(
    provider: &str,
    model: &str,
    messages: Vec<ChatMessage>,
    api_key: Option<&str>,
    base_url: Option<&str>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    on_token: impl Fn(&str),
) -> Result<String, String> {
    match provider {
        "ollama" => {
            let url = base_url.unwrap_or("http://localhost:11434");
            ollama_chat_stream(url, model, &messages, temperature, on_token).await
        }
        "openai" => {
            let key = api_key.ok_or("OpenAI API key not configured")?;
            let url = base_url.unwrap_or("https://api.openai.com/v1");
            openai_chat_stream(url, key, model, &messages, temperature, max_tokens, on_token)
                .await
        }
        "anthropic" => {
            let key = api_key.ok_or("Anthropic API key not configured")?;
            let url = base_url.unwrap_or("https://api.anthropic.com/v1");
            let system_msg = messages
                .iter()
                .find(|m| m.role == "system")
                .map(|m| m.content.as_str());
            anthropic_chat_stream(
                url,
                key,
                model,
                &messages,
                system_msg,
                temperature,
                max_tokens,
                on_token,
            )
            .await
        }
        _ => Err(format!("Unsupported provider: {provider}")),
    }
}
