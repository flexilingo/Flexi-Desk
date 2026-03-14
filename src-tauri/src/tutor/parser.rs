use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrammarCorrection {
    pub original: String,
    pub corrected: String,
    pub explanation: String,
    pub grammar_rule: String,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabSuggestion {
    pub word: String,
    pub translation: String,
    pub pos: Option<String>,
    pub cefr_level: Option<String>,
}

/// Parse the AI response to extract clean content, corrections, and vocabulary.
pub fn parse_ai_response(
    raw: &str,
) -> (String, Vec<GrammarCorrection>, Vec<VocabSuggestion>) {
    let mut clean = raw.to_string();
    let mut corrections: Vec<GrammarCorrection> = Vec::new();
    let mut vocab: Vec<VocabSuggestion> = Vec::new();

    // Extract corrections block
    let corrections_re =
        Regex::new(r"```corrections\s*\n([\s\S]*?)\n\s*```").unwrap();
    if let Some(cap) = corrections_re.captures(raw) {
        let json_str = cap.get(1).map(|m| m.as_str()).unwrap_or("[]");
        clean = corrections_re.replace(&clean, "").to_string();

        if let Ok(parsed) = serde_json::from_str::<Vec<GrammarCorrection>>(json_str) {
            corrections = parsed;
        }
    }

    // Extract vocabulary block
    let vocab_re =
        Regex::new(r"```vocabulary\s*\n([\s\S]*?)\n\s*```").unwrap();
    if let Some(cap) = vocab_re.captures(raw) {
        let json_str = cap.get(1).map(|m| m.as_str()).unwrap_or("[]");
        clean = vocab_re.replace(&clean, "").to_string();

        if let Ok(parsed) = serde_json::from_str::<Vec<VocabSuggestion>>(json_str) {
            vocab = parsed;
        }
    }

    // Clean up whitespace
    let clean = clean.trim().to_string();

    (clean, corrections, vocab)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_with_corrections_and_vocab() {
        let raw = r#"Sehr gut! Hier ist die Speisekarte.

```corrections
[{"original":"Ich möchte ein Wasser","corrected":"Ich möchte ein Wasser, bitte","explanation":"Add bitte for politeness","grammar_rule":"politeness","severity":"style"}]
```

```vocabulary
[{"word":"Speisekarte","translation":"menu","pos":"noun","cefr_level":"A2"}]
```"#;

        let (content, corrections, vocab) = parse_ai_response(raw);
        assert!(content.contains("Speisekarte"));
        assert!(!content.contains("```corrections"));
        assert_eq!(corrections.len(), 1);
        assert_eq!(corrections[0].original, "Ich möchte ein Wasser");
        assert_eq!(vocab.len(), 1);
        assert_eq!(vocab[0].word, "Speisekarte");
    }

    #[test]
    fn test_parse_no_blocks() {
        let raw = "Guten Tag! Wie geht es Ihnen?";
        let (content, corrections, vocab) = parse_ai_response(raw);
        assert_eq!(content, raw);
        assert!(corrections.is_empty());
        assert!(vocab.is_empty());
    }
}
