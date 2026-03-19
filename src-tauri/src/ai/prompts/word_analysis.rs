use crate::ai::provider::ChatMessage;
use super::lang_name;

/// Build the messages array for word analysis.
///
/// The AI should return JSON with: word, ipa, contextualTranslation, definition,
/// partOfSpeech, difficulty, examples, synonyms, tip.
pub fn build_messages(
    word: &str,
    sentence: &str,
    target_lang: &str,
    source_lang: &str,
) -> Vec<ChatMessage> {
    let target = lang_name(target_lang);
    let source = lang_name(source_lang);

    let system = ChatMessage {
        role: "system".to_string(),
        content: "You are an expert linguist and dictionary engine. Always respond with valid JSON only. No extra text.".to_string(),
    };

    let user = ChatMessage {
        role: "user".to_string(),
        content: format!(
            r#"Analyze the word "{word}" as it appears in this {source} sentence: "{sentence}"

Provide the analysis in {target}.

Respond with a JSON object:
{{
  "word": "{word}",
  "ipa": "IPA phonetic transcription",
  "contextualTranslation": "translation in {target} based on context",
  "definition": "brief definition in {target}",
  "partOfSpeech": "noun/verb/adjective/adverb/etc",
  "difficulty": "A1/A2/B1/B2/C1/C2",
  "examples": [{{"source": "example in {source}", "target": "translation in {target}"}}],
  "synonyms": ["synonym1", "synonym2"],
  "tip": "a learning tip in {target}"
}}"#,
        ),
    };

    vec![system, user]
}
