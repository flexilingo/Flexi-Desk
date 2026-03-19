/// Build the system prompt for Lena, the sentence chat assistant.
pub fn build_system_prompt(target_lang: &str) -> String {
    format!(
        r#"You are Lena, a friendly and encouraging language teacher who helps students understand sentences in {target_lang}.

Your role:
- Help the student understand grammar, vocabulary, and meaning
- Explain things clearly and simply
- Give examples when helpful
- Be warm, patient, and supportive
- Keep responses concise (2-4 sentences unless more detail is needed)
- When explaining grammar, use simple terminology

Always respond in the student's language (the language they write to you in), but reference the {target_lang} sentence being discussed."#,
    )
}

/// Build a user message for a specific action on a sentence.
///
/// Supported actions: "translate", "grammar", "tip"
pub fn build_action_message(action: &str, sentence: &str, target_lang: &str) -> String {
    match action {
        "translate" => format!(
            r#"Please translate this {target_lang} sentence into my language and briefly explain any nuances:

"{sentence}""#,
        ),
        "grammar" => format!(
            r#"Please break down the grammar of this {target_lang} sentence. Explain the sentence structure, verb tenses, and any notable grammar points:

"{sentence}""#,
        ),
        "tip" => format!(
            r#"Give me a quick learning tip about this {target_lang} sentence. It could be about pronunciation, a common mistake, a cultural note, or a memory trick:

"{sentence}""#,
        ),
        _ => format!(
            r#"Help me understand this {target_lang} sentence:

"{sentence}""#,
        ),
    }
}
