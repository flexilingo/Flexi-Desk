use std::path::Path;
use std::process::Stdio;

use serde::Deserialize;
use tokio::process::Command;

use super::types::{ParsedSegment, WordTimestamp};

// ── Public API ───────────────────────────────────────────

/// Run whisper.cpp on an audio file and return parsed segments.
///
/// The binary is expected to be the standard whisper.cpp `main`
/// CLI, supporting `-oj` (output JSON), `-m` (model), `-f` (file),
/// and `-l` (language) flags.
pub async fn transcribe_file(
    binary_path: &str,
    model_path: &str,
    audio_path: &str,
    language: &str,
) -> Result<Vec<ParsedSegment>, String> {
    validate_paths(binary_path, model_path, audio_path)?;

    // Build a temp output prefix so the JSON lands in a
    // predictable location (avoids polluting the audio dir).
    let output_prefix = std::env::temp_dir()
        .join(format!("flexi_whisper_{}", uuid_hex()));
    let output_prefix_str = output_prefix.to_string_lossy().to_string();

    let mut args: Vec<&str> = vec![
        "-m", model_path,
        "-f", audio_path,
        "-oj",
        "-of", &output_prefix_str,
        "--no-prints",
    ];

    if language != "auto" {
        args.push("-l");
        args.push(language);
    }

    let output = Command::new(binary_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute whisper binary: {e}"))?;

    let stderr_text = String::from_utf8_lossy(&output.stderr).to_string();
    let stdout_text = String::from_utf8_lossy(&output.stdout).to_string();

    if !output.status.success() {
        let _ = tokio::fs::remove_file(format!("{output_prefix_str}.json")).await;
        return Err(format!("Whisper process failed (exit {}): {stderr_text}",
            output.status.code().unwrap_or(-1)));
    }

    // Read the generated JSON file
    let json_path = format!("{output_prefix_str}.json");
    let json_content = tokio::fs::read_to_string(&json_path)
        .await
        .map_err(|e| {
            let mut msg = format!("Failed to read whisper output at {json_path}: {e}");
            if !stderr_text.is_empty() {
                msg.push_str(&format!("\nWhisper stderr: {stderr_text}"));
            }
            if !stdout_text.is_empty() {
                msg.push_str(&format!("\nWhisper stdout: {}", &stdout_text[..stdout_text.len().min(500)]));
            }
            msg
        })?;

    // Clean up temp file
    let _ = tokio::fs::remove_file(&json_path).await;

    parse_whisper_json(&json_content, language)
}

/// Check whether a whisper binary at `path` is executable.
pub fn check_binary(path: &str) -> bool {
    let p = Path::new(path);
    p.exists() && p.is_file()
}

/// Check whether a whisper model file exists.
pub fn check_model(path: &str) -> bool {
    let p = Path::new(path);
    p.exists() && p.is_file()
}

// ── Parsing ──────────────────────────────────────────────

/// Parse whisper.cpp `-oj` JSON output.
///
/// Expected format:
/// ```json
/// {
///   "transcription": [
///     {
///       "timestamps": { "from": "00:00:00,000", "to": "00:00:03,500" },
///       "offsets":    { "from": 0, "to": 3500 },
///       "text": " Hello, how are you?"
///     }
///   ]
/// }
/// ```
pub fn parse_whisper_json(
    json: &str,
    default_lang: &str,
) -> Result<Vec<ParsedSegment>, String> {
    let output: WhisperJsonOutput = serde_json::from_str(json)
        .map_err(|e| format!("Whisper JSON parse error: {e}"))?;

    let segments = output
        .transcription
        .into_iter()
        .filter_map(|seg| {
            let text = seg.text.trim().to_string();
            if text.is_empty() {
                return None;
            }

            let words: Vec<WordTimestamp> = seg.tokens.unwrap_or_default()
                .into_iter()
                .filter_map(|tok| {
                    let word = tok.text.trim().to_string();
                    if word.is_empty() || word == "[BLANK_AUDIO]" {
                        return None;
                    }
                    Some(WordTimestamp {
                        word,
                        start_ms: tok.offsets.from,
                        end_ms: tok.offsets.to,
                        confidence: tok.p.unwrap_or(0.0),
                    })
                })
                .collect();

            // Calculate segment confidence as average of word confidences
            let confidence = if words.is_empty() {
                0.0
            } else {
                let sum: f64 = words.iter().map(|w| w.confidence).sum();
                sum / words.len() as f64
            };

            Some(ParsedSegment {
                text,
                start_ms: seg.offsets.from,
                end_ms: seg.offsets.to,
                confidence,
                language: default_lang.to_string(),
                words,
            })
        })
        .collect();

    Ok(segments)
}

/// Parse the text-based output format as a fallback:
///   `[00:00:00.000 --> 00:00:03.500]  Hello, how are you?`
pub fn parse_whisper_text(text: &str, default_lang: &str) -> Vec<ParsedSegment> {
    let re = regex::Regex::new(
        r"\[(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\]\s*(.*)"
    ).unwrap();

    text.lines()
        .filter_map(|line| {
            let caps = re.captures(line)?;
            let start = parse_timestamp(&caps[1]);
            let end = parse_timestamp(&caps[2]);
            let t = caps[3].trim().to_string();
            if t.is_empty() { return None; }

            Some(ParsedSegment {
                text: t,
                start_ms: start,
                end_ms: end,
                confidence: 0.0,
                language: default_lang.to_string(),
                words: Vec::new(),
            })
        })
        .collect()
}

// ── Helpers ──────────────────────────────────────────────

pub fn validate_paths(bin: &str, model: &str, audio: &str) -> Result<(), String> {
    if !Path::new(bin).exists() {
        return Err(format!("Whisper binary not found: {bin}"));
    }
    if !Path::new(model).exists() {
        return Err(format!("Whisper model not found: {model}"));
    }
    if !Path::new(audio).exists() {
        return Err(format!("Audio file not found: {audio}"));
    }
    Ok(())
}

/// Parse `HH:MM:SS,mmm` or `HH:MM:SS.mmm` to milliseconds.
pub fn parse_timestamp(ts: &str) -> i64 {
    let parts: Vec<&str> = ts.split(':').collect();
    if parts.len() != 3 { return 0; }

    let h: i64 = parts[0].parse().unwrap_or(0);
    let m: i64 = parts[1].parse().unwrap_or(0);

    // Handle both `.` and `,` as decimal separator
    let sec_parts: Vec<&str> = parts[2].split(|c| c == '.' || c == ',').collect();
    let s: i64 = sec_parts[0].parse().unwrap_or(0);
    let ms: i64 = sec_parts.get(1).and_then(|v| v.parse().ok()).unwrap_or(0);

    (h * 3600 + m * 60 + s) * 1000 + ms
}

pub fn uuid_hex() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{nanos:032x}")
}

// ── Whisper JSON types ───────────────────────────────────

#[derive(Deserialize)]
struct WhisperJsonOutput {
    transcription: Vec<WhisperJsonSegment>,
}

#[derive(Deserialize)]
struct WhisperJsonSegment {
    #[allow(dead_code)]
    timestamps: WhisperTimestamps,
    offsets: WhisperOffsets,
    text: String,
    tokens: Option<Vec<WhisperToken>>,
}

#[derive(Deserialize)]
struct WhisperTimestamps {
    #[allow(dead_code)]
    from: String,
    #[allow(dead_code)]
    to: String,
}

#[derive(Deserialize)]
struct WhisperOffsets {
    from: i64,
    to: i64,
}

#[derive(Deserialize)]
struct WhisperToken {
    text: String,
    offsets: WhisperOffsets,
    #[serde(default)]
    p: Option<f64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_timestamp() {
        assert_eq!(parse_timestamp("00:00:00,000"), 0);
        assert_eq!(parse_timestamp("00:00:01,500"), 1500);
        assert_eq!(parse_timestamp("00:01:00.000"), 60000);
        assert_eq!(parse_timestamp("01:00:00,000"), 3600000);
        assert_eq!(parse_timestamp("00:02:30,750"), 150750);
    }

    #[test]
    fn test_parse_whisper_json() {
        let json = r#"{
            "transcription": [
                {
                    "timestamps": { "from": "00:00:00,000", "to": "00:00:03,500" },
                    "offsets": { "from": 0, "to": 3500 },
                    "text": " Hello, how are you?"
                },
                {
                    "timestamps": { "from": "00:00:03,500", "to": "00:00:06,000" },
                    "offsets": { "from": 3500, "to": 6000 },
                    "text": " I am fine, thanks."
                }
            ]
        }"#;

        let segments = parse_whisper_json(json, "en").unwrap();
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].text, "Hello, how are you?");
        assert_eq!(segments[0].start_ms, 0);
        assert_eq!(segments[0].end_ms, 3500);
        assert_eq!(segments[1].text, "I am fine, thanks.");
    }

    #[test]
    fn test_parse_whisper_text() {
        let text = "[00:00:00.000 --> 00:00:03.500]  Hello world\n\
                     [00:00:03.500 --> 00:00:06.000]  How are you";
        let segments = parse_whisper_text(text, "en");
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].text, "Hello world");
        assert_eq!(segments[1].start_ms, 3500);
    }

    #[test]
    fn test_parse_whisper_json_with_word_tokens() {
        let json = r#"{
            "transcription": [
                {
                    "timestamps": { "from": "00:00:00,000", "to": "00:00:02,000" },
                    "offsets": { "from": 0, "to": 2000 },
                    "text": " Hello world",
                    "tokens": [
                        { "text": " Hello", "offsets": { "from": 0, "to": 1000 }, "p": 0.95 },
                        { "text": " world", "offsets": { "from": 1000, "to": 2000 }, "p": 0.90 }
                    ]
                }
            ]
        }"#;
        let segments = parse_whisper_json(json, "en").unwrap();
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].words.len(), 2);
        assert_eq!(segments[0].words[0].word, "Hello");
        assert_eq!(segments[0].words[0].start_ms, 0);
        assert_eq!(segments[0].words[1].word, "world");
        assert_eq!(segments[0].words[1].end_ms, 2000);
    }

    #[test]
    fn test_parse_whisper_json_strips_leading_space() {
        let json = r#"{
            "transcription": [
                {
                    "timestamps": { "from": "00:00:00,000", "to": "00:00:01,000" },
                    "offsets": { "from": 0, "to": 1000 },
                    "text": "   Leading spaces"
                }
            ]
        }"#;
        let segments = parse_whisper_json(json, "en").unwrap();
        assert_eq!(segments[0].text, "Leading spaces");
    }

    #[test]
    fn test_parse_whisper_text_ignores_lines_without_timestamps() {
        let text = "[00:00:00.000 --> 00:00:02.000]  First segment\n\
                    \n\
                    This line has no timestamp and should be ignored\n\
                    [00:00:02.000 --> 00:00:04.000]  Second segment";
        let segments = parse_whisper_text(text, "en");
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].text, "First segment");
        assert_eq!(segments[1].text, "Second segment");
    }

    #[test]
    fn test_validate_paths_fails_on_missing_binary() {
        let result = validate_paths("/nonexistent/whisper", "/tmp", "/tmp");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("binary not found"));
    }
}
