use super::cefr::cefr_prompt;
use super::modes::mode_prompt;
use crate::tutor::scenarios::get_scenarios;

/// Core tutor persona and output format rules.
const BASE_PERSONA: &str = r#"You are FlexiLingo Tutor — a friendly, patient, and encouraging language tutor.

## Your Personality
- Warm and supportive, like a favorite teacher.
- Celebrate the student's progress. Praise correct usage of new or difficult structures.
- Be conversational, not like a textbook. Make learning feel natural and fun.
- Use humor when appropriate. Share brief anecdotes to keep things engaging.
- Keep responses concise: 2-4 sentences for the conversational part, plus corrections/vocabulary blocks when applicable.

## Output Format

After your conversational response, include the following blocks when applicable.

### Corrections
If the student made errors, add a corrections block:

:::corrections
[
  {
    "original": "the student's incorrect text",
    "corrected": "the correct version",
    "explanation": "brief explanation",
    "grammar_rule": "rule name",
    "severity": "error|warning|style"
  }
]
:::

If no corrections are needed, output:

:::corrections
[]
:::

### Vocabulary
If you introduce new vocabulary, add:

:::vocabulary
[
  {
    "word": "new word",
    "translation": "translation",
    "pos": "noun|verb|adj|adv|phrase",
    "cefr_level": "A1|A2|B1|B2|C1|C2"
  }
]
:::

IMPORTANT: Always include both blocks (corrections and vocabulary) in every response. Use empty arrays [] if nothing to report."#;

/// Build the full system prompt by composing BASE_PERSONA + context + CEFR block + mode block.
///
/// This is the new modular builder. For backward compatibility with existing callers that pass
/// `(language, cefr_level, native_language, scenario_id)`, use [`build_system_prompt`] instead.
pub fn build_system_prompt_full(
    target_language: &str,
    native_language: &str,
    cefr_level: &str,
    mode: &str,
    topic: Option<&str>,
    scenario_context: Option<&str>,
    deck_words: Option<&[String]>,
) -> String {
    let lang_name = language_name(target_language);
    let native_name = language_name(native_language);

    let context_block = format!(
        r#"## Context
- Target language: {lang_name}
- Student's native language: {native_name}
- Speak primarily in {lang_name}.
- Use {native_name} only when explicitly allowed by the CEFR level instructions below.
- Ask follow-up questions to keep the conversation flowing."#
    );

    let cefr_block = cefr_prompt(cefr_level);
    let mode_block = mode_prompt(mode, topic, scenario_context, deck_words);

    format!(
        "{BASE_PERSONA}\n\n{context_block}\n\n{cefr_block}\n\n{mode_block}"
    )
}

/// Backward-compatible system prompt builder.
///
/// Maps the old 4-param signature to the new modular builder.
/// Existing callers in `commands/tutor.rs` use this function.
pub fn build_system_prompt(
    language: &str,
    cefr_level: &str,
    native_language: &str,
    scenario_id: Option<&str>,
) -> String {
    let scenario_context = scenario_id.and_then(|id| {
        get_scenarios()
            .into_iter()
            .find(|s| s.id == id)
            .map(|s| s.opening_prompt)
    });

    let mode = if scenario_context.is_some() {
        "role_play"
    } else {
        "free"
    };

    build_system_prompt_full(
        language,
        native_language,
        cefr_level,
        mode,
        None,
        scenario_context.as_deref(),
        None,
    )
}

/// Generate a mode-specific opening message for the tutor to start with.
pub fn opening_message(
    mode: &str,
    target_language: &str,
    cefr_level: &str,
    topic: Option<&str>,
    scenario_title: Option<&str>,
) -> String {
    let lang_name = language_name(target_language);

    match mode {
        "free" => {
            let topic_part = match topic {
                Some(t) if !t.is_empty() => format!("about {t}"),
                _ => "on any topic you like".to_string(),
            };
            format!(
                "Start a natural, friendly conversation in {lang_name} {topic_part}. \
                 Greet the student warmly and ask an engaging opening question appropriate for CEFR level {cefr_level}."
            )
        }
        "role_play" => {
            let scenario_part = match scenario_title {
                Some(title) => format!("for the scenario: {title}"),
                None => "based on the scenario described in the system prompt".to_string(),
            };
            format!(
                "Begin the role play {scenario_part}. \
                 Stay in character and deliver your opening line in {lang_name}, appropriate for CEFR level {cefr_level}."
            )
        }
        "deck_practice" => {
            format!(
                "Start a conversation in {lang_name} that will naturally incorporate the target vocabulary words. \
                 Greet the student and begin a topic where the first few deck words can come up naturally. \
                 Appropriate for CEFR level {cefr_level}."
            )
        }
        "vocab_challenge" => {
            format!(
                "Welcome the student to the Vocabulary Challenge in {lang_name}! \
                 Briefly explain the rules: you will present one word at a time, they translate it, \
                 and you will track their score. Then present the first word at CEFR level {cefr_level}."
            )
        }
        "escape_room" => {
            format!(
                "Set the scene dramatically: the student has entered the Tower of Babel. \
                 Describe the ancient tower, the mysterious atmosphere, and explain that they must \
                 ascend through 5 rooms of language challenges to escape. \
                 Then describe Room 1: The Lexicon Gate, and present the first challenge in {lang_name} \
                 appropriate for CEFR level {cefr_level}."
            )
        }
        _ => {
            format!(
                "Start a friendly conversation in {lang_name}. \
                 Greet the student and begin at CEFR level {cefr_level}."
            )
        }
    }
}

/// Convert a language code to a human-readable name.
pub fn language_name(code: &str) -> &'static str {
    match code {
        "en" => "English",
        "fa" => "Persian",
        "ar" => "Arabic",
        "tr" => "Turkish",
        "es" => "Spanish",
        "fr" => "French",
        "de" => "German",
        "zh" => "Chinese",
        "hi" => "Hindi",
        "ru" => "Russian",
        _ => "the target language",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_name_known_codes() {
        assert_eq!(language_name("en"), "English");
        assert_eq!(language_name("fa"), "Persian");
        assert_eq!(language_name("ar"), "Arabic");
        assert_eq!(language_name("tr"), "Turkish");
        assert_eq!(language_name("es"), "Spanish");
        assert_eq!(language_name("fr"), "French");
        assert_eq!(language_name("de"), "German");
        assert_eq!(language_name("zh"), "Chinese");
        assert_eq!(language_name("hi"), "Hindi");
        assert_eq!(language_name("ru"), "Russian");
    }

    #[test]
    fn test_language_name_unknown_code() {
        assert_eq!(language_name("xx"), "the target language");
    }

    #[test]
    fn test_build_system_prompt_contains_language_name() {
        let prompt = build_system_prompt("en", "B1", "fa", None);
        assert!(prompt.contains("English"));
        assert!(prompt.contains("Persian"));
    }

    #[test]
    fn test_build_system_prompt_contains_cefr_level() {
        let prompt = build_system_prompt("en", "B2", "fa", None);
        assert!(prompt.contains("B2"));
    }

    #[test]
    fn test_build_system_prompt_with_valid_scenario_injects_opening() {
        let prompt = build_system_prompt("en", "A1", "fa", Some("restaurant_order"));
        assert!(prompt.contains("waiter") || prompt.contains("restaurant") || prompt.contains("order"));
    }

    #[test]
    fn test_build_system_prompt_unknown_scenario_id_has_no_scenario_block() {
        let prompt_without = build_system_prompt("en", "A1", "fa", None);
        let prompt_bad_id = build_system_prompt("en", "A1", "fa", Some("nonexistent_id"));
        // Both should use free mode since bad id yields no scenario context
        assert!(prompt_without.contains("Free Conversation"));
        assert!(prompt_bad_id.contains("Free Conversation"));
    }

    #[test]
    fn test_build_system_prompt_is_nonempty() {
        let prompt = build_system_prompt("en", "A1", "fa", None);
        assert!(!prompt.is_empty());
        assert!(prompt.len() > 100);
    }

    #[test]
    fn test_build_system_prompt_full_contains_all_blocks() {
        let prompt = build_system_prompt_full(
            "de", "en", "B1", "free", Some("travel"), None, None,
        );
        assert!(prompt.contains("FlexiLingo Tutor")); // BASE_PERSONA
        assert!(prompt.contains("German"));            // Context
        assert!(prompt.contains("B1"));                // CEFR
        assert!(prompt.contains("Free Conversation")); // Mode
        assert!(prompt.contains("travel"));            // Topic
    }

    #[test]
    fn test_build_system_prompt_full_role_play() {
        let prompt = build_system_prompt_full(
            "fr", "en", "A2", "role_play", None,
            Some("You are a shopkeeper in Paris"), None,
        );
        assert!(prompt.contains("Role Play"));
        assert!(prompt.contains("shopkeeper"));
    }

    #[test]
    fn test_build_system_prompt_full_deck_practice() {
        let words = vec!["Haus".into(), "Schule".into()];
        let prompt = build_system_prompt_full(
            "de", "en", "A2", "deck_practice", None, None, Some(&words),
        );
        assert!(prompt.contains("Deck Practice"));
        assert!(prompt.contains("Haus"));
    }

    #[test]
    fn test_build_system_prompt_contains_correction_markers() {
        let prompt = build_system_prompt("en", "B1", "fa", None);
        assert!(prompt.contains(":::corrections"));
        assert!(prompt.contains(":::vocabulary"));
    }

    #[test]
    fn test_opening_message_free() {
        let msg = opening_message("free", "en", "B1", Some("movies"), None);
        assert!(msg.contains("English"));
        assert!(msg.contains("movies"));
    }

    #[test]
    fn test_opening_message_role_play() {
        let msg = opening_message("role_play", "de", "A2", None, Some("Hotel Check-in"));
        assert!(msg.contains("Hotel Check-in"));
    }

    #[test]
    fn test_opening_message_escape_room() {
        let msg = opening_message("escape_room", "fr", "B1", None, None);
        assert!(msg.contains("Tower of Babel"));
    }

    #[test]
    fn test_opening_message_vocab_challenge() {
        let msg = opening_message("vocab_challenge", "es", "A1", None, None);
        assert!(msg.contains("Vocabulary Challenge"));
    }

    #[test]
    fn test_opening_message_deck_practice() {
        let msg = opening_message("deck_practice", "ar", "B2", None, None);
        assert!(msg.contains("Arabic"));
    }
}
