use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncReadExt};
use tokio::process::{Child, Command};

// ── Types ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveSegmentEvent {
    pub session_id: String,
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub is_partial: bool,
    pub segment_index: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SidecarStatus {
    Idle,
    Starting,
    Running,
    Error,
    Crashed,
}

// ── Sidecar ──────────────────────────────────────────────

/// Manages a `whisper-stream` process that captures audio directly
/// from the system audio device and outputs transcription segments.
/// Segments are parsed from stdout and emitted as Tauri events.
pub struct WhisperSidecar {
    child: Child,
    _stdout_task: tokio::task::JoinHandle<()>,
    _stderr_task: tokio::task::JoinHandle<()>,
}

impl WhisperSidecar {
    /// Spawn `whisper-stream` with its own audio capture.
    ///
    /// * `stream_binary_path` – path to the whisper-stream binary
    /// * `model_path` – path to the GGML model file
    /// * `language` – ISO 639-1 code or "en"
    /// * `capture_device_id` – SDL capture device ID (integer), or None for default
    /// * `session_id` – used to tag emitted events
    /// * `app` – Tauri app handle for emitting events
    pub fn spawn(
        stream_binary_path: &str,
        model_path: &str,
        language: &str,
        capture_device_id: Option<i32>,
        session_id: String,
        app: tauri::AppHandle,
    ) -> Result<Self, String> {
        // Validate files exist
        if !std::path::Path::new(stream_binary_path).is_file() {
            return Err(format!(
                "whisper-stream binary not found: {stream_binary_path}"
            ));
        }
        if !std::path::Path::new(model_path).is_file() {
            return Err(format!("Whisper model not found: {model_path}"));
        }

        let mut args = vec![
            "-m".to_string(),
            model_path.to_string(),
            "--step".to_string(),
            "500".to_string(),
            "--length".to_string(),
            "5000".to_string(),
            "-t".to_string(),
            "4".to_string(),
            "-l".to_string(),
            if language == "auto" {
                "en".to_string()
            } else {
                language.to_string()
            },
            "--keep-context".to_string(),
        ];

        if let Some(dev_id) = capture_device_id {
            args.push("-c".to_string());
            args.push(dev_id.to_string());
        }

        let mut child = Command::new(stream_binary_path)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn whisper-stream: {e}"))?;

        // ── stdout reader ─────────────────────────────────
        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to open whisper-stream stdout")?;

        let session_id_clone = session_id.clone();
        let app_clone = app.clone();

        let stdout_task = tokio::spawn(async move {
            let mut reader = stdout;
            let mut buf = vec![0u8; 4096];
            let mut line_buf = Vec::new();
            // Current segment index for partial updates — increments on \n (finalized)
            let mut current_segment: i64 = 0;

            loop {
                match reader.read(&mut buf).await {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        for &byte in &buf[..n] {
                            if byte == b'\r' || byte == b'\n' {
                                // Process accumulated chunk
                                if !line_buf.is_empty() {
                                    let raw = String::from_utf8_lossy(&line_buf).to_string();
                                    let text = strip_ansi_codes(&raw);
                                    let text = text.trim();

                                    if !text.is_empty() && is_meaningful_text(text) {
                                        // \r = partial (whisper refining current text)
                                        // \n = finalized segment
                                        let is_partial = byte == b'\r';

                                        let event = LiveSegmentEvent {
                                            session_id: session_id_clone.clone(),
                                            text: text.to_string(),
                                            start_ms: 0,
                                            end_ms: 0,
                                            is_partial,
                                            segment_index: current_segment,
                                        };

                                        let _ = app_clone.emit("caption:live-segment", &event);
                                    }

                                    line_buf.clear();
                                }

                                // On newline, advance to next segment
                                if byte == b'\n' {
                                    current_segment += 1;
                                }
                            } else {
                                line_buf.push(byte);
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        // ── stderr reader ─────────────────────────────────
        let stderr = child
            .stderr
            .take()
            .ok_or("Failed to open whisper-stream stderr")?;

        let stderr_task = tokio::spawn(async move {
            let reader = tokio::io::BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[whisper-stream] {line}");
            }
        });

        Ok(Self {
            child,
            _stdout_task: stdout_task,
            _stderr_task: stderr_task,
        })
    }

    /// Stop the sidecar: kill the process and wait for exit.
    pub async fn stop(mut self) -> Result<(), String> {
        // whisper-stream runs indefinitely — kill it to stop
        let _ = self.child.kill().await;

        // Wait for process to actually exit
        let timeout = tokio::time::Duration::from_secs(3);
        let _ = tokio::time::timeout(timeout, self.child.wait()).await;

        // Abort background tasks
        self._stdout_task.abort();
        self._stderr_task.abort();

        Ok(())
    }

    /// Kill the sidecar immediately.
    pub async fn kill(mut self) {
        let _ = self.child.kill().await;
        self._stdout_task.abort();
        self._stderr_task.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi_codes_passthrough_plain_text() {
        assert_eq!(strip_ansi_codes("Hello, world!"), "Hello, world!");
    }

    #[test]
    fn test_strip_ansi_codes_removes_clear_line_sequence() {
        // \x1b[2K is the "erase entire line" ANSI code
        assert_eq!(strip_ansi_codes("\x1b[2Khello"), "hello");
    }

    #[test]
    fn test_strip_ansi_codes_removes_multiple_sequences() {
        assert_eq!(strip_ansi_codes("\x1b[2K\x1b[Ahello\x1b[0m"), "hello");
    }

    #[test]
    fn test_strip_ansi_codes_empty_string() {
        assert_eq!(strip_ansi_codes(""), "");
    }

    #[test]
    fn test_strip_ansi_codes_only_escape_sequence() {
        assert_eq!(strip_ansi_codes("\x1b[2K"), "");
    }

    #[test]
    fn test_is_meaningful_text_real_sentence() {
        assert!(is_meaningful_text("Hello, how are you?"));
    }

    #[test]
    fn test_is_meaningful_text_blank_audio_token() {
        assert!(!is_meaningful_text("[blank_audio]"));
        assert!(!is_meaningful_text("[BLANK_AUDIO]"));
    }

    #[test]
    fn test_is_meaningful_text_silence_token() {
        assert!(!is_meaningful_text("[silence]"));
        assert!(!is_meaningful_text("(silence)"));
    }

    #[test]
    fn test_is_meaningful_text_no_audio_token() {
        assert!(!is_meaningful_text("[no audio]"));
    }

    #[test]
    fn test_is_meaningful_text_only_brackets_and_whitespace() {
        assert!(!is_meaningful_text("[ ]"));
        assert!(!is_meaningful_text("()"));
    }

    #[test]
    fn test_is_meaningful_text_start_speaking_token() {
        assert!(!is_meaningful_text("[start speaking]"));
    }
}

// ── Helpers ──────────────────────────────────────────────

/// Strip ANSI escape codes (e.g. \033[2K) from a string.
fn strip_ansi_codes(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // Skip ESC + '[' + params + final byte
            if chars.next() == Some('[') {
                // Consume until we hit a letter (the final byte of the escape sequence)
                for c2 in chars.by_ref() {
                    if c2.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

/// Check if text from whisper-stream is meaningful (not noise tokens).
fn is_meaningful_text(text: &str) -> bool {
    let lower = text.to_lowercase();
    // Filter out whisper noise tokens
    if lower.contains("[blank_audio]")
        || lower.contains("[no audio]")
        || lower.contains("[start speaking]")
        || lower.contains("(silence)")
        || lower.contains("[silence]")
    {
        return false;
    }
    // Filter out text that's only whitespace, punctuation, or brackets
    let stripped: String = text
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '[' && *c != ']' && *c != '(' && *c != ')')
        .collect();
    !stripped.is_empty()
}
