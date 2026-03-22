pub mod sentence_chat;
pub mod word_analysis;
pub mod word_batch;
pub mod writing_eval;

/// Map a language code to its full name for use in LLM prompts.
/// LLMs understand language names much better than ISO codes.
pub fn lang_name(code: &str) -> &str {
    match code {
        "fa" => "Persian (فارسی)",
        "ar" => "Arabic (العربية)",
        "tr" => "Turkish (Türkçe)",
        "es" => "Spanish (Español)",
        "fr" => "French (Français)",
        "de" => "German (Deutsch)",
        "zh" => "Chinese (中文)",
        "hi" => "Hindi (हिन्दी)",
        "ru" => "Russian (Русский)",
        "en" => "English",
        "ja" => "Japanese (日本語)",
        "ko" => "Korean (한국어)",
        "pt" => "Portuguese (Português)",
        "it" => "Italian (Italiano)",
        _ => code,
    }
}
