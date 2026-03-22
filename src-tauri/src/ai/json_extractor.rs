/// Extract a JSON value from text that may contain markdown fences or surrounding prose.
///
/// Tries in order:
/// 1. Parse the entire text as JSON
/// 2. Extract from ```json ... ``` code fences
/// 3. Extract the first `{...}` or `[...]` block
pub fn extract_json(text: &str) -> Result<serde_json::Value, String> {
    let trimmed = text.trim();

    // 1. Try full parse
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return Ok(val);
    }

    // 2. Try code fence extraction
    if let Some(val) = extract_from_code_fence(trimmed) {
        return Ok(val);
    }

    // 3. Try brace extraction
    if let Some(val) = extract_braces(trimmed) {
        return Ok(val);
    }

    Err("No valid JSON found in response".to_string())
}

/// Extract JSON from markdown code fences like ```json ... ``` or ``` ... ```
fn extract_from_code_fence(text: &str) -> Option<serde_json::Value> {
    // Match ```json or ``` followed by content and closing ```
    let patterns = ["```json", "```"];

    for pattern in patterns {
        if let Some(start_idx) = text.find(pattern) {
            let after_marker = start_idx + pattern.len();
            let rest = &text[after_marker..];

            // Skip past the newline after the opening fence
            let content_start = rest.find('\n').map(|i| i + 1).unwrap_or(0);
            let content = &rest[content_start..];

            // Find the closing ```
            if let Some(end_idx) = content.find("```") {
                let json_str = content[..end_idx].trim();
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                    return Some(val);
                }
            }
        }
    }

    None
}

/// Extract the first balanced `{...}` or `[...]` from the text.
/// Tries whichever structure appears first in the text.
fn extract_braces(text: &str) -> Option<serde_json::Value> {
    let obj_pos = text.find('{');
    let arr_pos = text.find('[');
    let order: &[char] = match (obj_pos, arr_pos) {
        (Some(o), Some(a)) if a < o => &['[', '{'],
        _ => &['{', '['],
    };
    for &open_char in order {
        let close_char = if open_char == '{' { '}' } else { ']' };

        if let Some(start) = text.find(open_char) {
            let mut depth = 0i32;
            let mut in_string = false;
            let mut escape_next = false;

            for (i, ch) in text[start..].char_indices() {
                if escape_next {
                    escape_next = false;
                    continue;
                }

                if ch == '\\' && in_string {
                    escape_next = true;
                    continue;
                }

                if ch == '"' {
                    in_string = !in_string;
                    continue;
                }

                if in_string {
                    continue;
                }

                if ch == open_char {
                    depth += 1;
                } else if ch == close_char {
                    depth -= 1;
                    if depth == 0 {
                        let candidate = &text[start..start + i + ch.len_utf8()];
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(candidate) {
                            return Some(val);
                        }
                        break;
                    }
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plain_json() {
        let input = r#"{"word": "hello", "ipa": "/helo/"}"#;
        let result = extract_json(input).unwrap();
        assert_eq!(result["word"], "hello");
    }

    #[test]
    fn test_code_fence() {
        let input = "Here is the result:\n```json\n{\"word\": \"test\"}\n```\nDone.";
        let result = extract_json(input).unwrap();
        assert_eq!(result["word"], "test");
    }

    #[test]
    fn test_brace_extraction() {
        let input = "The analysis is: {\"score\": 85} and that's it.";
        let result = extract_json(input).unwrap();
        assert_eq!(result["score"], 85);
    }

    #[test]
    fn test_no_json() {
        let input = "This has no JSON at all.";
        assert!(extract_json(input).is_err());
    }

    #[test]
    fn test_array_extraction() {
        let input = "Results: [{\"a\": 1}, {\"b\": 2}]";
        let result = extract_json(input).unwrap();
        assert!(result.is_array());
        assert_eq!(result[0]["a"], 1);
    }

    #[test]
    fn test_nested_braces() {
        let input = r#"result: {"outer": {"inner": 42}}"#;
        let result = extract_json(input).unwrap();
        assert_eq!(result["outer"]["inner"], 42);
    }

    #[test]
    fn test_escaped_quote_in_string() {
        let input = r#"{"key": "value with \" quote"}"#;
        let result = extract_json(input).unwrap();
        assert_eq!(result["key"], "value with \" quote");
    }

    #[test]
    fn test_plain_code_fence_no_language() {
        let input = "```\n{\"score\": 99}\n```";
        let result = extract_json(input).unwrap();
        assert_eq!(result["score"], 99);
    }

    #[test]
    fn test_two_json_objects_returns_first() {
        let input = r#"first: {"a": 1} second: {"b": 2}"#;
        let result = extract_json(input).unwrap();
        assert_eq!(result["a"], 1);
        assert!(result.get("b").is_none());
    }
}
