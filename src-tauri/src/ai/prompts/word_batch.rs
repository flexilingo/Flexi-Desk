use crate::ai::provider::ChatMessage;
use super::lang_name;

/// Build messages for basic batch translation.
/// Matches the backend's buildBasicPrompt() in batch-translator.ts exactly.
/// Returns: {"translations": [{word, translation}]}
pub fn build_basic_messages(
    words: &[String],
    native_lang: &str,
    target_lang: &str,
    _sentence: &str,
) -> Vec<ChatMessage> {
    let native = lang_name(native_lang);
    let target = lang_name(target_lang);

    let words_list = words
        .iter()
        .enumerate()
        .map(|(i, w)| format!("{}. \"{}\"", i + 1, w))
        .collect::<Vec<_>>()
        .join("\n");

    let system = ChatMessage {
        role: "system".to_string(),
        content: "You are an expert linguist and translator. Always respond with valid JSON only.".to_string(),
    };

    let user = ChatMessage {
        role: "user".to_string(),
        content: format!(
            r#"Task: Translate the following {target} words/phrases to {native}.
Provide the most common translation for each.

Words to translate:
{words_list}

Output Requirement: Return ONLY a raw JSON object with this schema:
{{
  "translations": [
    {{
      "word": "original word",
      "translation": "translation in {native}"
    }}
  ]
}}

Keep translations simple and use the most common meaning."#,
        ),
    };

    vec![system, user]
}

/// Build messages for smart batch enrichment.
/// Matches the backend's buildSmartPrompt() in batch-translator.ts exactly.
/// Returns: {"translations": [{word, translation, definition, partOfSpeech, difficulty, ipa, examples}]}
pub fn build_smart_messages(
    words: &[String],
    native_lang: &str,
    target_lang: &str,
    sentence: &str,
) -> Vec<ChatMessage> {
    let native = lang_name(native_lang);
    let target = lang_name(target_lang);

    let words_list = words
        .iter()
        .enumerate()
        .map(|(i, w)| {
            if sentence.is_empty() {
                format!("{}. \"{}\" - No context available", i + 1, w)
            } else {
                format!("{}. \"{}\" - Context: \"{}\"", i + 1, w, sentence)
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    let system = ChatMessage {
        role: "system".to_string(),
        content: "You are an expert linguist and translator. Always respond with valid JSON only.".to_string(),
    };

    let user = ChatMessage {
        role: "user".to_string(),
        content: format!(
            r#"Task: Translate the following {target} words/phrases to {native}.
For each word, provide a contextual translation based on how it's used in the given sentence.

Words to translate:
{words_list}

Output Requirement: Return ONLY a raw JSON object with this schema:
{{
  "translations": [
    {{
      "word": "original word",
      "translation": "translation in {native}",
      "definition": "brief definition in {native}",
      "partOfSpeech": "noun/verb/adj/adv/phrase/etc",
      "difficulty": "A1/A2/B1/B2/C1/C2",
      "ipa": "pronunciation in IPA",
      "examples": [
        {{ "source": "Example sentence in {target}", "target": "Translation in {native}" }}
      ]
    }}
  ]
}}

Important:
- The translation should match the meaning in the given context
- For phrases and collocations, translate the entire phrase naturally
- Keep definitions concise (under 20 words)
- Provide 1-2 short examples per word
- CRITICAL - Part of Speech Consistency: The partOfSpeech, translation, definition, and examples must ALL be consistent with each other:
  - If partOfSpeech is "verb", the translation MUST be a verb form, the definition must describe an action, and examples must use the word as a verb
  - If partOfSpeech is "noun", the translation MUST be a noun form and examples must use the word as a noun
  - If partOfSpeech is "adj", the translation MUST be an adjective form and examples must use it as an adjective
- For words ending in "-ing": determine from context whether it's used as a verb (gerund/continuous) or a noun. Set partOfSpeech accordingly"#,
        ),
    };

    vec![system, user]
}
