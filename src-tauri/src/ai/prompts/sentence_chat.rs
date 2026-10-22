use super::lang_name;

/// Build the system prompt for Lena, the sentence chat assistant.
pub fn build_system_prompt(target_lang: &str) -> String {
    let lang = lang_name(target_lang);
    format!(
        r#"You are Lena (لینا), a friendly and encouraging language teacher.

Rules:
- ALWAYS respond in {lang}. Every word of your response must be in {lang}.
- Help students understand English sentences
- Explain grammar, vocabulary, and meaning clearly and simply
- Give examples when helpful
- Be warm, patient, and supportive
- Keep responses concise (2-4 short paragraphs max)
- Use simple terminology when explaining grammar"#,
    )
}

/// Build a user message for a specific action on a sentence.
pub fn build_action_message(action: &str, sentence: &str, target_lang: &str) -> String {
    let lang = lang_name(target_lang);
    match action {
        "translate" => format!(
            r#"Translate this English sentence to {lang} and briefly explain any nuances. Respond entirely in {lang}.

"{sentence}""#,
        ),
        "grammar" => format!(
            r#"Break down the grammar of this English sentence. Explain sentence structure, verb tenses, and notable grammar points. Respond entirely in {lang}.

"{sentence}""#,
        ),
        "tip" => format!(
            r#"Give a quick learning tip about this English sentence. It could be about pronunciation, a common mistake, a cultural note, or a memory trick. Respond entirely in {lang}.

"{sentence}""#,
        ),
        "vocab" => format!(
            r#"List the key vocabulary of this sentence: for each important word or phrase give its meaning in this context, its part of speech, and one short example. Respond entirely in {lang}.

"{sentence}""#,
        ),
        _ => format!(
            r#"Help me understand this English sentence. Respond entirely in {lang}.

"{sentence}""#,
        ),
    }
}

/// Messages for Lena's structured analysis of one sentence (the website's `analyze-sentence`):
/// grammar, key patterns, vocabulary with CEFR levels, tips, difficulty and a translation, as JSON.
pub fn build_analysis_messages(
    sentence: &str,
    prev_sentence: Option<&str>,
    next_sentence: Option<&str>,
    target_lang: &str,
) -> (String, String) {
    let lang = lang_name(target_lang);
    let system = format!(
        r#"You are Lena, a language teacher. Analyse one sentence for a learner and answer ONLY with a JSON object, no prose.

Shape:
{{
  "sentence": "<the sentence, unchanged>",
  "grammar": {{
    "structure": "<sentence structure, short>",
    "tense": "<main verb tense>",
    "voice": "<active or passive>",
    "mood": "<indicative, imperative, conditional, subjunctive...>",
    "patterns": [{{ "pattern": "<a grammar pattern used>", "explanation": "<why/how, one sentence>", "example": "<a new example sentence>" }}]
  }},
  "vocabulary": [{{ "word": "<word or phrase from the sentence>", "cefr": "<A1..C2>", "definition": "<meaning in this context>" }}],
  "tips": ["<a short learning tip>"],
  "difficulty": "<A1..C2 for the whole sentence>",
  "translation": "<the sentence translated>"
}}

Rules:
- "structure", "tense", "voice", "mood", "explanation", "definition", "tips" and "translation" are written in {lang}.
- "sentence", "pattern", "example" and "word" stay in the sentence's own language.
- 1 to 3 patterns, 2 to 6 vocabulary items, 1 to 3 tips."#,
    );
    let mut user = String::new();
    if let Some(prev) = prev_sentence.filter(|s| !s.trim().is_empty()) {
        user.push_str(&format!("Previous sentence (context only): \"{prev}\"\n"));
    }
    if let Some(next) = next_sentence.filter(|s| !s.trim().is_empty()) {
        user.push_str(&format!("Next sentence (context only): \"{next}\"\n"));
    }
    user.push_str(&format!("Sentence to analyse: \"{sentence}\""));
    (system, user)
}
