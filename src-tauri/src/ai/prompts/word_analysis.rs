use crate::ai::provider::ChatMessage;

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
    let system = ChatMessage {
        role: "system".to_string(),
        content: "You are an expert linguist and dictionary engine. Always respond with valid JSON only.".to_string(),
    };

    let user = ChatMessage {
        role: "user".to_string(),
        content: format!(
            r#"Analyze the word "{word}" as it appears in this sentence: "{sentence}"

The sentence is in {target_lang}. Provide the analysis in {source_lang}.

Respond with a JSON object containing:
{{
  "word": "{word}",
  "ipa": "IPA transcription of the word",
  "contextualTranslation": "translation in {source_lang} considering the sentence context",
  "definition": "brief definition in {source_lang}",
  "partOfSpeech": "noun/verb/adjective/adverb/etc",
  "difficulty": "A1/A2/B1/B2/C1/C2",
  "examples": ["example sentence 1 in {target_lang}", "example sentence 2 in {target_lang}"],
  "synonyms": ["synonym1", "synonym2"],
  "tip": "a brief memory tip or usage note in {source_lang}"
}}"#,
        ),
    };

    vec![system, user]
}
