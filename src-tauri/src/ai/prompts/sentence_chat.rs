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
        _ => format!(
            r#"Help me understand this English sentence. Respond entirely in {lang}.

"{sentence}""#,
        ),
    }
}
