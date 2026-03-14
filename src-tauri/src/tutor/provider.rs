use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Send a chat completion request to Ollama's API.
/// Ollama runs locally on http://localhost:11434
pub async fn ollama_chat(
    model: &str,
    messages: Vec<ChatMessage>,
    base_url: Option<&str>,
) -> Result<String, String> {
    let url = format!(
        "{}/api/chat",
        base_url.unwrap_or("http://localhost:11434")
    );

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": false,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {e}. Is Ollama running?"))?;

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
) -> Result<String, String> {
    let url = format!(
        "{}/v1/chat/completions",
        base_url.unwrap_or("https://api.openai.com")
    );

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
    });

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

/// Dispatch to the right provider based on provider name.
pub async fn chat_completion(
    provider: &str,
    model: &str,
    messages: Vec<ChatMessage>,
    api_key: Option<&str>,
    base_url: Option<&str>,
) -> Result<String, String> {
    match provider {
        "ollama" => ollama_chat(model, messages, base_url).await,
        "openai" => {
            let key = api_key.ok_or("OpenAI API key not configured")?;
            openai_chat(model, messages, key, base_url).await
        }
        _ => Err(format!("Unsupported provider: {provider}")),
    }
}
