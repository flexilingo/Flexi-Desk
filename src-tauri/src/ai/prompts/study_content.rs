// =============================================================================
// Study engine — activity content generation prompts (local ollama).
// =============================================================================
// The cloud build fills `pr_activity_template` from an offline GPT pipeline. Desk
// has no such pipeline, so we generate the same payload shapes on demand and cache
// them in the local `pr_activity_template` table. Every prompt asks for the exact
// JSON shape of the matching ActivityPromptPayload variant (minus the `type` tag).
// =============================================================================

use crate::ai::provider::ChatMessage;

fn system() -> ChatMessage {
    ChatMessage {
        role: "system".to_string(),
        content: "You are a precise language-exercise generator. Always reply with valid JSON only, \
                  no markdown, no commentary. Keep language simple and learner-friendly."
            .to_string(),
    }
}

/// Cloze: a natural sentence using `word`, with the word replaced by "____".
pub fn cloze(word: &str, meaning: &str, language: &str) -> Vec<ChatMessage> {
    vec![
        system(),
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                r#"Write one natural {language} sentence (8-16 words) that uses the word "{word}" (meaning: {meaning}).
Then replace that word with exactly four underscores: ____

Respond ONLY with a raw JSON object matching exactly:
{{
  "sentence": "the sentence containing ____",
  "target": "{word}",
  "distractors": ["three", "plausible", "wrong words"]
}}"#
            ),
        },
    ]
}

/// Synonym discrimination: a context sentence + 4 options, one correct.
pub fn synonym(word: &str, meaning: &str, language: &str) -> Vec<ChatMessage> {
    vec![
        system(),
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                r#"A learner is studying the {language} word "{word}" (meaning: {meaning}).

Write one natural context sentence where "{word}" would fit, but write "___" where the word belongs.
Then give exactly 4 answer options: the correct word "{word}" plus 3 plausible but wrong words.
Report the zero-based index of the correct option.

Respond ONLY with a raw JSON object matching exactly:
{{
  "context_sentence": "sentence with ___",
  "options": ["opt0", "opt1", "opt2", "opt3"],
  "correct_index": 0
}}"#
            ),
        },
    ]
}

/// Mini reading: a short paragraph using the word + one comprehension question.
pub fn mini_reading(word: &str, meaning: &str, language: &str) -> Vec<ChatMessage> {
    vec![
        system(),
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                r#"Write a short {language} paragraph (3-4 sentences, learner-friendly) that naturally uses the word "{word}" (meaning: {meaning}).
Then write one comprehension question about the paragraph with exactly 3 answer choices, and give the zero-based index of the correct choice.

Respond ONLY with a raw JSON object matching exactly:
{{
  "paragraph": "the paragraph",
  "target_words": ["{word}"],
  "comprehension_question": "the question",
  "comprehension_choices": ["a", "b", "c"],
  "comprehension_correct_index": 0
}}"#
            ),
        },
    ]
}
