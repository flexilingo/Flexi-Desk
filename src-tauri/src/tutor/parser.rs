use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrammarCorrection {
    pub original: String,
    pub corrected: String,
    pub explanation: String,
    #[serde(default, rename = "type", alias = "correction_type")]
    pub correction_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabSuggestion {
    pub word: String,
    pub translation: String,
    #[serde(default, alias = "example_sentence")]
    pub example: String,
    #[serde(default, alias = "cefr_level")]
    pub cefr: String,
    #[serde(default)]
    pub pos: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ParsedResponse {
    pub content: String,
    pub corrections: Vec<GrammarCorrection>,
    pub vocabulary: Vec<VocabSuggestion>,
}

/// Extract a `:::tag ... :::` block from text.
/// Returns (before, json_content, after) if found.
fn extract_block(text: &str, tag: &str) -> Option<(String, String, String)> {
    let open = format!(":::{}", tag);
    let start = text.find(&open)?;
    let after_open = start + open.len();
    let remaining = &text[after_open..];
    let end = remaining.find(":::")?;
    let json_content = remaining[..end].trim().to_string();
    let before = text[..start].to_string();
    let after = remaining[end + 3..].to_string();
    Some((before, json_content, after))
}

/// Extract a ```tag ... ``` code block from text.
/// Returns (before, json_content, after) if found.
fn extract_code_block(text: &str, tag: &str) -> Option<(String, String, String)> {
    let open = format!("```{}", tag);
    let start = text.find(&open)?;
    let after_open = start + open.len();
    let remaining = &text[after_open..];
    let end = remaining.find("```")?;
    let json_content = remaining[..end].trim().to_string();
    let before = text[..start].to_string();
    let after = remaining[end + 3..].to_string();
    Some((before, json_content, after))
}

/// Extract a `### Tag:` or `**Tag:**` markdown section containing JSON.
/// Looks for the section header, then finds the JSON array `[...]` within it.
fn extract_markdown_section(text: &str, tag: &str) -> Option<(String, String, String)> {
    let lower = text.to_lowercase();
    let tag_lower = tag.to_lowercase();

    // Find header like "### Corrections:", "**Corrections:**", "Corrections:"
    let patterns = [
        format!("### {}:", tag_lower),
        format!("**{}:**", tag_lower),
        format!("{}:", tag_lower),
    ];

    let mut start = None;
    let mut header_len = 0;
    for pattern in &patterns {
        if let Some(pos) = lower.find(pattern.as_str()) {
            start = Some(pos);
            header_len = pattern.len();
            break;
        }
    }

    let start = start?;
    let after_header = start + header_len;
    let remaining = &text[after_header..];

    // Find the JSON array in the remaining text
    let arr_start = remaining.find('[')?;
    let arr_text = &remaining[arr_start..];

    // Find matching closing bracket (handle nested brackets)
    let mut depth = 0;
    let mut end_pos = None;
    for (i, ch) in arr_text.char_indices() {
        match ch {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    end_pos = Some(i + 1);
                    break;
                }
            }
            _ => {}
        }
    }

    let end_pos = end_pos?;
    let json_content = arr_text[..end_pos].to_string();
    let before = text[..start].to_string();
    let after = remaining[arr_start + end_pos..].to_string();

    Some((before, json_content, after))
}

/// Parse the AI response to extract clean content, corrections, and vocabulary.
///
/// Supports two block formats:
/// - `:::corrections ... :::` / `:::vocabulary ... :::`
/// - `` ```corrections ... ``` `` / `` ```vocabulary ... ``` ``
pub fn parse_ai_response(raw: &str) -> ParsedResponse {
    let mut remaining = raw.to_string();
    let mut corrections: Vec<GrammarCorrection> = Vec::new();
    let mut vocabulary: Vec<VocabSuggestion> = Vec::new();

    // Extract corrections block (try ::: first, then ``` fallback)
    if let Some((before, json_content, after)) = extract_block(&remaining, "corrections") {
        if let Ok(parsed) = serde_json::from_str::<Vec<GrammarCorrection>>(&json_content) {
            corrections = parsed;
        }
        remaining = format!("{}{}", before, after);
    } else if let Some((before, json_content, after)) =
        extract_code_block(&remaining, "corrections")
    {
        if let Ok(parsed) = serde_json::from_str::<Vec<GrammarCorrection>>(&json_content) {
            corrections = parsed;
        }
        remaining = format!("{}{}", before, after);
    }

    // Extract vocabulary block (try ::: first, then ``` fallback)
    if let Some((before, json_content, after)) = extract_block(&remaining, "vocabulary") {
        if let Ok(parsed) = serde_json::from_str::<Vec<VocabSuggestion>>(&json_content) {
            vocabulary = parsed;
        }
        remaining = format!("{}{}", before, after);
    } else if let Some((before, json_content, after)) =
        extract_code_block(&remaining, "vocabulary")
    {
        if let Ok(parsed) = serde_json::from_str::<Vec<VocabSuggestion>>(&json_content) {
            vocabulary = parsed;
        }
        remaining = format!("{}{}", before, after);
    }

    // Fallback: try ### Corrections: / ### Vocabulary: markdown headers
    if corrections.is_empty() {
        if let Some((before, json, after)) = extract_markdown_section(&remaining, "Corrections") {
            if let Ok(parsed) = serde_json::from_str::<Vec<GrammarCorrection>>(&json) {
                corrections = parsed;
            }
            remaining = format!("{}{}", before, after);
        }
    }
    if vocabulary.is_empty() {
        if let Some((before, json, after)) = extract_markdown_section(&remaining, "Vocabulary") {
            if let Ok(parsed) = serde_json::from_str::<Vec<VocabSuggestion>>(&json) {
                vocabulary = parsed;
            }
            remaining = format!("{}{}", before, after);
        }
    }

    ParsedResponse {
        content: remaining.trim().to_string(),
        corrections,
        vocabulary,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_with_corrections_and_vocabulary() {
        let raw = r#"Sehr gut! Hier ist die Speisekarte.

:::corrections
[{"original":"Ich möchte ein Wasser","corrected":"Ich möchte ein Wasser, bitte","explanation":"Add bitte for politeness","type":"grammar"}]
:::

:::vocabulary
[{"word":"Speisekarte","translation":"menu","example":"Kann ich die Speisekarte sehen?","cefr":"A2"}]
:::"#;

        let result = parse_ai_response(raw);
        assert!(result.content.contains("Speisekarte"));
        assert!(!result.content.contains(":::corrections"));
        assert!(!result.content.contains(":::vocabulary"));
        assert_eq!(result.corrections.len(), 1);
        assert_eq!(result.corrections[0].original, "Ich möchte ein Wasser");
        assert_eq!(result.corrections[0].correction_type, "grammar");
        assert_eq!(result.vocabulary.len(), 1);
        assert_eq!(result.vocabulary[0].word, "Speisekarte");
        assert_eq!(result.vocabulary[0].cefr, "A2");
    }

    #[test]
    fn test_parse_no_blocks() {
        let raw = "Guten Tag! Wie geht es Ihnen?";
        let result = parse_ai_response(raw);
        assert_eq!(result.content, raw);
        assert!(result.corrections.is_empty());
        assert!(result.vocabulary.is_empty());
    }

    #[test]
    fn test_parse_only_corrections() {
        let raw = r#"Good job!

:::corrections
[{"original":"I goes","corrected":"I go","explanation":"Subject-verb agreement","type":"grammar"}]
:::"#;

        let result = parse_ai_response(raw);
        assert_eq!(result.content, "Good job!");
        assert_eq!(result.corrections.len(), 1);
        assert_eq!(result.corrections[0].corrected, "I go");
        assert!(result.vocabulary.is_empty());
    }

    #[test]
    fn test_parse_backtick_code_block_fallback() {
        let raw = r#"Nice work!

```corrections
[{"original":"She don't","corrected":"She doesn't","explanation":"Auxiliary verb agreement","type":"grammar"}]
```

```vocabulary
[{"word":"agreement","translation":"توافق","example":"We reached an agreement.","cefr":"B1"}]
```"#;

        let result = parse_ai_response(raw);
        assert!(result.content.contains("Nice work!"));
        assert!(!result.content.contains("```corrections"));
        assert_eq!(result.corrections.len(), 1);
        assert_eq!(result.corrections[0].corrected, "She doesn't");
        assert_eq!(result.vocabulary.len(), 1);
        assert_eq!(result.vocabulary[0].word, "agreement");
    }

    #[test]
    fn test_parse_invalid_json_skips_silently() {
        let raw = r#"Hello!

:::corrections
this is not valid json at all
:::

:::vocabulary
[{"word":"test","translation":"تست","example":"This is a test.","cefr":"A1"}]
:::"#;

        let result = parse_ai_response(raw);
        assert!(result.content.contains("Hello!"));
        assert!(result.corrections.is_empty());
        assert_eq!(result.vocabulary.len(), 1);
        assert_eq!(result.vocabulary[0].word, "test");
    }

    #[test]
    fn test_cefr_defaults_to_empty_string() {
        let raw = r#"Hi!

:::vocabulary
[{"word":"hello","translation":"سلام","example":"Hello, how are you?"}]
:::"#;

        let result = parse_ai_response(raw);
        assert_eq!(result.vocabulary.len(), 1);
        assert_eq!(result.vocabulary[0].cefr, "");
    }
}
