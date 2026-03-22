use crate::tutor::scenarios::get_scenarios;

/// Build the system prompt for the AI tutor.
pub fn build_system_prompt(
    language: &str,
    cefr_level: &str,
    native_language: &str,
    scenario_id: Option<&str>,
) -> String {
    let lang_name = language_name(language);
    let native_name = language_name(native_language);
    let level_instructions = get_level_instructions(cefr_level);
    let scenario_block = scenario_id
        .and_then(|id| {
            get_scenarios()
                .into_iter()
                .find(|s| s.id == id)
                .map(|s| format!("\n## Scenario\n{}\nStay in character throughout the conversation.\n", s.opening_prompt))
        })
        .unwrap_or_default();

    format!(
r#"You are a friendly, patient language tutor helping a student practice {lang_name}.

## Student Level
The student is at CEFR level {cefr_level}.
{level_instructions}

## Your Behavior
1. Speak primarily in {lang_name}. Use {native_name} only for explanations when the student is confused.
2. Keep your vocabulary and grammar within the student's CEFR level.
3. Be encouraging. Celebrate correct usage, especially of new or advanced structures.
4. Naturally introduce 1-2 new vocabulary words per exchange that are slightly above their level.
5. Ask follow-up questions to keep the conversation flowing.
6. Keep responses concise (2-4 sentences for conversation, plus corrections/vocab blocks).

## Corrections
After your conversational response, if the student made any errors, provide corrections in this JSON format enclosed in ```corrections markers:

```corrections
[
  {{
    "original": "the student's incorrect text",
    "corrected": "the correct version",
    "explanation": "brief explanation in {native_name}",
    "grammar_rule": "rule name",
    "severity": "error"
  }}
]
```

If no corrections needed, output: ```corrections
[]
```

## Vocabulary
If you introduce new vocabulary, add:

```vocabulary
[
  {{
    "word": "new word in {lang_name}",
    "translation": "translation in {native_name}",
    "pos": "noun/verb/adj/adv",
    "cefr_level": "B1"
  }}
]
```
{scenario_block}
Remember: Be conversational, not like a textbook. Make learning feel natural."#
    )
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
    fn test_get_level_instructions_all_cefr_levels() {
        for level in &["A1", "A2", "B1", "B2", "C1", "C2"] {
            let instructions = get_level_instructions(level);
            assert!(!instructions.is_empty(), "Instructions empty for level {level}");
        }
    }

    #[test]
    fn test_get_level_instructions_unknown_level_returns_fallback() {
        let instructions = get_level_instructions("X1");
        assert!(!instructions.is_empty());
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
        // Both should produce the same output (no scenario block injected)
        assert_eq!(prompt_without, prompt_bad_id);
    }

    #[test]
    fn test_build_system_prompt_is_nonempty() {
        let prompt = build_system_prompt("en", "A1", "fa", None);
        assert!(!prompt.is_empty());
        assert!(prompt.len() > 100);
    }
}

fn get_level_instructions(cefr_level: &str) -> &'static str {
    match cefr_level {
        "A1" => "Use only the most basic vocabulary (greetings, numbers, colors, family). \
                 Speak in very short, simple sentences. \
                 Repeat key words often. Expect single-word or very short answers.",
        "A2" => "Use simple everyday vocabulary. \
                 Speak in simple sentences about familiar topics (shopping, daily routine). \
                 The student can handle basic questions and simple descriptions.",
        "B1" => "Use intermediate vocabulary. \
                 The student can discuss familiar topics, express opinions, and describe experiences. \
                 Use some compound sentences. Introduce common idioms.",
        "B2" => "Use a wide range of vocabulary including some abstract concepts. \
                 The student can engage in detailed discussions, argue a viewpoint. \
                 Use complex sentence structures. Introduce nuanced vocabulary.",
        "C1" => "Use advanced vocabulary including idiomatic and colloquial expressions. \
                 The student can discuss complex topics fluently. \
                 Use sophisticated grammar structures. Challenge the student with subtlety.",
        "C2" => "Use native-level vocabulary freely. \
                 The student is near-native. Focus on stylistic nuance, \
                 rare expressions, cultural references, and register appropriateness.",
        _ => "Adapt to the student's apparent level based on their responses.",
    }
}

fn language_name(code: &str) -> &'static str {
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
