use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrammarCorrection {
    pub original: String,
    pub corrected: String,
    pub explanation: String,
    #[serde(rename = "type")]
    pub correction_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabSuggestion {
    pub word: String,
    pub translation: String,
    pub example: String,
    #[serde(default)]
    pub cefr: String,
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
