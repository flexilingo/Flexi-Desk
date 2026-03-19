use super::types::*;
use futures_util::StreamExt;
use reqwest::Client;
use std::time::Duration;

pub struct OllamaClient {
    client: Client,
    base_url: String,
}

impl OllamaClient {
    pub fn new(base_url: Option<&str>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(120))
                .build()
                .unwrap(),
            base_url: base_url.unwrap_or("http://localhost:11434").to_string(),
        }
    }

    pub async fn health_check(&self) -> Result<String, String> {
        let url = format!("{}/api/version", self.base_url);
        let response = self
            .client
            .get(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| format!("Ollama not reachable: {e}"))?;

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Invalid response: {e}"))?;

        json["version"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "No version in response".to_string())
    }

    pub async fn list_models(&self) -> Result<Vec<OllamaModel>, String> {
        let url = format!("{}/api/tags", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to list models: {e}"))?;

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {e}"))?;

        let models = json["models"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|m| {
                Some(OllamaModel {
                    name: m["name"].as_str()?.to_string(),
                    size: m["size"].as_u64().unwrap_or(0),
                    digest: m["digest"].as_str().unwrap_or("").to_string(),
                    modified_at: m["modified_at"].as_str().unwrap_or("").to_string(),
                })
            })
            .collect();

        Ok(models)
    }

    pub async fn status(&self) -> OllamaStatus {
        match self.health_check().await {
            Ok(version) => {
                let models = self.list_models().await.unwrap_or_default();
                OllamaStatus {
                    connected: true,
                    version: Some(version),
                    models,
                    base_url: self.base_url.clone(),
                }
            }
            Err(_) => OllamaStatus {
                connected: false,
                version: None,
                models: vec![],
                base_url: self.base_url.clone(),
            },
        }
    }

    pub async fn chat_stream<F>(
        &self,
        model: &str,
        messages: Vec<serde_json::Value>,
        mut on_token: F,
    ) -> Result<String, String>
    where
        F: FnMut(&str, bool),
    {
        let url = format!("{}/api/chat", self.base_url);
        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true,
        });

        let response = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama stream error: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama error ({status}): {text}"));
        }

        let mut stream = response.bytes_stream();
        let mut full_content = String::new();

        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| format!("Stream read error: {e}"))?;
            let text = String::from_utf8_lossy(&bytes);

            for line in text.lines() {
                if line.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                    let token = json["message"]["content"].as_str().unwrap_or("");
                    let done = json["done"].as_bool().unwrap_or(false);

                    if !token.is_empty() {
                        full_content.push_str(token);
                    }
                    on_token(token, done);
                }
            }
        }

        Ok(full_content)
    }

    pub async fn chat(
        &self,
        model: &str,
        messages: Vec<serde_json::Value>,
    ) -> Result<String, String> {
        let url = format!("{}/api/chat", self.base_url);
        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": false,
        });

        let response = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama error: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama error ({status}): {text}"));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {e}"))?;

        Ok(json["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }

    pub async fn pull_model<F>(
        &self,
        model_name: &str,
        mut on_progress: F,
    ) -> Result<(), String>
    where
        F: FnMut(OllamaPullProgress),
    {
        let pull_client = Client::builder()
            .timeout(Duration::from_secs(1800))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

        let url = format!("{}/api/pull", self.base_url);
        let body = serde_json::json!({
            "name": model_name,
            "stream": true,
        });

        let response = pull_client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama pull error: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama pull error ({status}): {text}"));
        }

        let mut stream = response.bytes_stream();
        let mut last_percent: i32 = -1;

        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| format!("Stream read error: {e}"))?;
            let text = String::from_utf8_lossy(&bytes);

            for line in text.lines() {
                if line.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                    let status = json["status"].as_str().unwrap_or("").to_string();
                    let digest = json["digest"].as_str().map(|s| s.to_string());
                    let total = json["total"].as_u64();
                    let completed = json["completed"].as_u64();

                    let percent = match (completed, total) {
                        (Some(c), Some(t)) if t > 0 => (c as f64 / t as f64) * 100.0,
                        _ => 0.0,
                    };

                    let current_percent = percent as i32;
                    if current_percent != last_percent || status == "success" {
                        last_percent = current_percent;
                        on_progress(OllamaPullProgress {
                            model_name: model_name.to_string(),
                            status: status.clone(),
                            digest,
                            total,
                            completed,
                            percent,
                        });
                    }
                }
            }
        }

        Ok(())
    }

    pub async fn delete_model(&self, model_name: &str) -> Result<(), String> {
        let url = format!("{}/api/delete", self.base_url);
        let body = serde_json::json!({ "name": model_name });

        let response = self
            .client
            .delete(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama delete error: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama delete error ({status}): {text}"));
        }

        Ok(())
    }
}
