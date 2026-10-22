use futures_util::StreamExt;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::Notify;

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

    // A blank value means "not set" (the settings screen stores "" to clear an address).
    let api_key = get(&format!("{}_api_key", provider)).filter(|v| !v.trim().is_empty());
    let base_url = get(&format!("{}_base_url", provider)).filter(|v| !v.trim().is_empty());

    AiSettings {
        provider,
        model,
        api_key,
        base_url,
    }
}

/// The key an OpenAI-compatible call authenticates with. A custom base URL
/// (LM Studio, OpenRouter, a local gateway) may need no key at all, so an empty
/// key is allowed there; the official endpoint always needs one.
fn openai_key<'a>(api_key: Option<&'a str>, base_url: Option<&str>) -> Result<&'a str, String> {
    match api_key.map(str::trim).filter(|k| !k.is_empty()) {
        Some(k) => Ok(k),
        None if base_url.map(|u| !u.trim().is_empty()).unwrap_or(false) => Ok(""),
        None => Err("AI_KEY_MISSING".to_string()),
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
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err("OLLAMA_MODEL_MISSING".to_string());
        }
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
    let mut request = client.post(&url).json(&body);
    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {api_key}"));
    }
    let response = request
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

// ---------------------------------------------------------------------------
// Time limit and Cancel for every non-streaming AI call
// ---------------------------------------------------------------------------
//
// A small model on a slow CPU can take half an hour on one exam insight. Every
// call through `chat_completion` therefore has a time limit (the user can change
// it in Settings -> My AI) and can be cancelled from the UI. Either way the request
// future is dropped, which closes the HTTP connection - Ollama stops generating
// when its client goes away, so the computer is not left busy.

/// Settings key holding the per-call limit in seconds.
pub const AI_TIMEOUT_SETTING: &str = "ai_request_timeout_sec";
pub const DEFAULT_AI_TIMEOUT_SECS: u64 = 180;
const MIN_AI_TIMEOUT_SECS: u64 = 30;
const MAX_AI_TIMEOUT_SECS: u64 = 3600;

static AI_TIMEOUT_SECS: AtomicU64 = AtomicU64::new(DEFAULT_AI_TIMEOUT_SECS);
static AI_CANCEL: OnceLock<Notify> = OnceLock::new();

fn cancel_signal() -> &'static Notify {
    AI_CANCEL.get_or_init(Notify::new)
}

/// The per-call limit from a stored setting: a number of seconds, clamped; anything
/// unreadable means the default.
pub fn parse_timeout_setting(value: Option<&str>) -> u64 {
    value
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(|v| v.clamp(MIN_AI_TIMEOUT_SECS, MAX_AI_TIMEOUT_SECS))
        .unwrap_or(DEFAULT_AI_TIMEOUT_SECS)
}

pub fn set_request_timeout_secs(secs: u64) {
    AI_TIMEOUT_SECS.store(
        secs.clamp(MIN_AI_TIMEOUT_SECS, MAX_AI_TIMEOUT_SECS),
        Ordering::Relaxed,
    );
}

pub fn request_timeout_secs() -> u64 {
    AI_TIMEOUT_SECS.load(Ordering::Relaxed)
}

/// Reads the stored limit (at start-up).
pub fn load_request_timeout(conn: &Connection) {
    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params![AI_TIMEOUT_SETTING],
            |row| row.get(0),
        )
        .ok();
    set_request_timeout_secs(parse_timeout_setting(stored.as_deref()));
}

/// Stops every AI call that is running now (the Cancel button). Calls started
/// afterwards are not affected.
pub fn cancel_requests() {
    cancel_signal().notify_waiters();
}

/// Runs one AI call under the time limit and the Cancel signal.
/// `AI_TIMEOUT` / `AI_CANCELLED` are codes the UI translates.
pub async fn guard_ai_call<F>(limit: Duration, call: F) -> Result<String, String>
where
    F: Future<Output = Result<String, String>>,
{
    guard_with(cancel_signal(), limit, call).await
}

async fn guard_with<F>(signal: &Notify, limit: Duration, call: F) -> Result<String, String>
where
    F: Future<Output = Result<String, String>>,
{
    // Registered before the call starts, so a Cancel pressed at any moment reaches it.
    let cancelled = signal.notified();
    tokio::pin!(cancelled);
    cancelled.as_mut().enable();
    tokio::select! {
        result = tokio::time::timeout(limit, call) => {
            result.unwrap_or_else(|_| Err("AI_TIMEOUT".to_string()))
        }
        _ = &mut cancelled => Err("AI_CANCELLED".to_string()),
    }
}

/// Dispatch to the right provider based on provider name, under the time limit
/// and the Cancel signal.
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
    let limit = Duration::from_secs(request_timeout_secs());
    guard_ai_call(
        limit,
        dispatch_chat(provider, model, messages, api_key, base_url, temperature, max_tokens, json_mode),
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn dispatch_chat(
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
            let key = openai_key(api_key, base_url)?;
            openai_chat(model, messages, key, base_url, temperature, max_tokens, json_mode).await
        }
        "anthropic" => {
            let key = api_key.filter(|k| !k.trim().is_empty()).ok_or("AI_KEY_MISSING")?;
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
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err("OLLAMA_MODEL_MISSING".to_string());
        }
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
    let mut request = client.post(&url).json(&body);
    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {api_key}"));
    }
    let response = request
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
            let key = openai_key(api_key, base_url)?;
            let url = base_url.unwrap_or("https://api.openai.com");
            openai_chat_stream(url, key, model, &messages, temperature, max_tokens, on_token)
                .await
        }
        "anthropic" => {
            let key = api_key.filter(|k| !k.trim().is_empty()).ok_or("AI_KEY_MISSING")?;
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

#[cfg(test)]
mod key_tests {
    use super::openai_key;

    #[test]
    fn official_endpoint_needs_a_key() {
        assert_eq!(openai_key(None, None), Err("AI_KEY_MISSING".to_string()));
        assert_eq!(openai_key(Some("  "), None), Err("AI_KEY_MISSING".to_string()));
        assert_eq!(openai_key(Some("sk-1"), None), Ok("sk-1"));
    }

    #[test]
    fn custom_address_may_need_no_key() {
        assert_eq!(openai_key(None, Some("http://localhost:1234")), Ok(""));
        assert_eq!(openai_key(None, Some("  ")), Err("AI_KEY_MISSING".to_string()));
    }
}

#[cfg(test)]
mod guard_tests {
    use super::*;

    #[test]
    fn timeout_setting_is_clamped_and_defaults() {
        assert_eq!(parse_timeout_setting(None), DEFAULT_AI_TIMEOUT_SECS);
        assert_eq!(parse_timeout_setting(Some("abc")), DEFAULT_AI_TIMEOUT_SECS);
        assert_eq!(parse_timeout_setting(Some("300")), 300);
        assert_eq!(parse_timeout_setting(Some("5")), MIN_AI_TIMEOUT_SECS);
        assert_eq!(parse_timeout_setting(Some("999999")), MAX_AI_TIMEOUT_SECS);
    }

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread().enable_time().build().unwrap()
    }

    #[test]
    fn a_call_past_its_limit_ends_with_ai_timeout() {
        let out = rt().block_on(guard_ai_call(Duration::from_millis(20), async {
            tokio::time::sleep(Duration::from_secs(5)).await;
            Ok("late".to_string())
        }));
        assert_eq!(out, Err("AI_TIMEOUT".to_string()));
    }

    #[test]
    fn a_quick_call_passes_through() {
        let out = rt().block_on(guard_ai_call(Duration::from_secs(5), async { Ok("ok".to_string()) }));
        assert_eq!(out, Ok("ok".to_string()));
    }

    #[test]
    fn cancel_stops_a_running_call() {
        // Its own signal: the shared one would also cancel the other tests' calls.
        let signal = Notify::new();
        let out = rt().block_on(async {
            let call = guard_with(&signal, Duration::from_secs(30), async {
                tokio::time::sleep(Duration::from_secs(10)).await;
                Ok("never".to_string())
            });
            let cancel = async {
                tokio::time::sleep(Duration::from_millis(20)).await;
                signal.notify_waiters();
                std::future::pending::<()>().await;
            };
            tokio::select! {
                r = call => r,
                _ = cancel => unreachable!(),
            }
        });
        assert_eq!(out, Err("AI_CANCELLED".to_string()));
    }
}
