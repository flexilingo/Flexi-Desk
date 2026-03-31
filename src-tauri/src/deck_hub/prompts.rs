use crate::ai::provider::ChatMessage;
use crate::ai::prompts::lang_name;

/// Build messages for text analysis — extract vocabulary/phrases from arbitrary text.
/// Returns JSON: {"items": [{word, translation, definition, pos, cefr_level, ipa, examples, memory_hook, collocations, card_type}]}
pub fn build_text_analysis_messages(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Vec<ChatMessage> {
    let source = lang_name(source_lang);
    let target = lang_name(target_lang);

    // Truncate very long texts to stay within token budget (~3000 chars ≈ ~750 tokens)
    let truncated_text = if text.len() > 3000 {
        format!("{}...[truncated]", &text[..3000])
    } else {
        text.to_string()
    };

    let system = ChatMessage {
        role: "system".to_string(),
        content: format!(
            "You are an expert linguist and language teacher specializing in {target}. \
             Your task is to extract the most valuable vocabulary, phrases, and grammar patterns \
             from a given text for language learners. Always respond with valid JSON only."
        ),
    };

    let user = ChatMessage {
        role: "user".to_string(),
        content: format!(
            r#"Analyze the following {target} text and extract the most useful vocabulary, \
phrases, and grammar patterns for a language learner whose native language is {source}.

Text to analyze:
---
{truncated_text}
---

Extract up to 30 items. Focus on:
1. Vocabulary words (nouns, verbs, adjectives, adverbs) that are B1+ level
2. Common phrases and idioms
3. Useful collocations
4. Grammar patterns worth learning

Output Requirement: Return ONLY a raw JSON object with this exact schema:
{{
  "items": [
    {{
      "word": "the word or phrase in {target}",
      "translation": "translation in {source}",
      "definition": "brief definition in {source} (under 20 words)",
      "pos": "noun|verb|adj|adv|phrase|collocation|grammar",
      "cefr_level": "A1|A2|B1|B2|C1|C2",
      "ipa": "IPA pronunciation (empty string if unknown)",
      "examples": [
        {{"source": "example sentence in {target}", "target": "translation in {source}"}}
      ],
      "memory_hook": "optional memory tip or mnemonic (null if none)",
      "collocations": ["common collocation 1", "common collocation 2"],
      "card_type": "vocabulary|phrase|grammar|collocation"
    }}
  ]
}}

Important:
- Skip very common words (the, a, is, are, have) unless they form important phrases
- Include context-appropriate translations based on how the word is used in the text
- Provide 1-2 short examples per item
- Set cefr_level accurately based on word frequency and complexity
- Leave ipa as empty string "" if unsure
- collocations should be 2-5 common word combinations for the item"#,
        ),
    };

    vec![system, user]
}
