use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModeInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
}

/// Returns the list of available conversation practice modes.
pub fn list_modes() -> Vec<ModeInfo> {
    vec![
        ModeInfo {
            id: "free".into(),
            name: "Free Conversation".into(),
            description: "Natural conversation on any topic with gentle corrections and new vocabulary.".into(),
            icon: "MessageCircle".into(),
        },
        ModeInfo {
            id: "role_play".into(),
            name: "Role Play".into(),
            description: "Practice real-world scenarios by acting out roles with the tutor.".into(),
            icon: "Theater".into(),
        },
        ModeInfo {
            id: "deck_practice".into(),
            name: "Deck Practice".into(),
            description: "Practice using words from your flashcard decks in natural conversation.".into(),
            icon: "Layers".into(),
        },
        ModeInfo {
            id: "vocab_challenge".into(),
            name: "Vocabulary Challenge".into(),
            description: "Test your vocabulary with rapid word-by-word translation challenges.".into(),
            icon: "Zap".into(),
        },
        ModeInfo {
            id: "escape_room".into(),
            name: "Escape Room".into(),
            description: "Solve language puzzles through the Tower of Babel to prove your mastery.".into(),
            icon: "Castle".into(),
        },
    ]
}

/// Build the mode-specific prompt block.
pub fn mode_prompt(
    mode: &str,
    topic: Option<&str>,
    scenario_context: Option<&str>,
    deck_words: Option<&[String]>,
) -> String {
    match mode {
        "free" => free_prompt(topic),
        "role_play" => role_play_prompt(scenario_context),
        "deck_practice" => deck_practice_prompt(deck_words),
        "vocab_challenge" => vocab_challenge_prompt(),
        "escape_room" => escape_room_prompt(),
        _ => free_prompt(topic),
    }
}

fn free_prompt(topic: Option<&str>) -> String {
    let topic_line = match topic {
        Some(t) if !t.is_empty() => format!("The current topic is: **{t}**. Stay on this topic but let it evolve naturally."),
        _ => "Choose an interesting topic from the list below to start, then let the conversation flow naturally.".to_string(),
    };

    format!(
        r#"## Mode: Free Conversation

{topic_line}

### Behavior
- Be a natural, engaging conversation partner. Ask follow-up questions.
- Introduce 1-2 new vocabulary words per exchange that are slightly above the student's level.
- Let the conversation evolve naturally based on what the student says. Don't force topic changes.
- If conversation stalls, gently introduce a related sub-topic rather than switching abruptly.
- Share short personal anecdotes (as a tutor character) to make conversation feel real.
- If the student gives short answers, ask open-ended questions to draw them out.

### Topic Ideas
Travel and adventures, Food and cooking, Movies and TV shows, Music and concerts,
Sports and fitness, Technology and gadgets, Books and reading, Nature and environment,
Hobbies and crafts, Work and career, Education and learning, Family and relationships,
Health and wellness, Fashion and style, Art and culture, Science and discoveries,
History and traditions, Dreams and aspirations, Daily routines, Holidays and celebrations,
Animals and pets, Social media, City vs country life, Childhood memories, Future plans."#
    )
}

fn role_play_prompt(scenario_context: Option<&str>) -> String {
    let scenario_block = match scenario_context {
        Some(ctx) if !ctx.is_empty() => format!("### Scenario\n{ctx}"),
        _ => "### Scenario\nWait for the student to suggest a scenario, or propose one yourself (e.g., ordering at a cafe, checking into a hotel, asking for directions).".to_string(),
    };

    format!(
        r#"## Mode: Role Play

{scenario_block}

### Behavior
- Stay fully in character throughout the conversation. Do not break character.
- React naturally to what the student says within the scenario context.
- Provide corrections only at natural pauses (after the student finishes a thought, not mid-sentence).
- Gently guide the student toward the scenario objective without being pushy.
- If the student goes off-script, steer back naturally within character.
- Use vocabulary and expressions that are authentic to the scenario setting.
- When the scenario reaches a natural conclusion, congratulate the student and suggest a follow-up scenario."#
    )
}

fn deck_practice_prompt(deck_words: Option<&[String]>) -> String {
    let words_block = match deck_words {
        Some(words) if !words.is_empty() => {
            let word_list = words.join(", ");
            format!(
                "### Target Words\nThe student is practicing these words from their deck:\n{word_list}\n\nWeave these words into the conversation naturally. Try to cover all of them across the session."
            )
        }
        _ => "### Target Words\nNo specific deck words provided. Ask the student which words they want to practice, or conduct a general vocabulary conversation.".to_string(),
    };

    format!(
        r#"## Mode: Deck Practice

{words_block}

### Behavior
- Weave the target words into conversation naturally. Do not just quiz them in a list.
- Create contexts and scenarios where the target words come up organically.
- When the student correctly uses a target word, acknowledge it briefly (e.g., "Great use of [word]!").
- If the student struggles with a word, provide a hint through context rather than a direct translation.
- Track which words have been covered. Toward the end, try to bring up any words not yet used.
- Ask questions that naturally elicit the target words in the student's responses.
- After every 5-6 exchanges, internally note which words remain uncovered and steer toward them."#
    )
}

fn vocab_challenge_prompt() -> String {
    r#"## Mode: Vocabulary Challenge

### Rules
- Present ONE word at a time in the target language.
- Wait for the student to provide the translation or definition.
- After the student responds, tell them if they were correct or incorrect.
- If incorrect, provide the correct answer and a brief example sentence.
- If correct, praise them and optionally provide an example sentence or a related word.
- Keep a running score. Every 5 words, announce the score (e.g., "Score: 4/5").
- Start with words at the student's CEFR level, then gradually increase difficulty.
- Mix word types: nouns, verbs, adjectives, adverbs, common phrases.
- After 10 words, offer to continue or end the challenge.
- Do NOT use :::corrections blocks in this mode — use inline feedback instead.

### Scoring Format
After every 5 words, output:
📊 Score: X/5 (this round) | Total: X/Y (overall)"#.to_string()
}

fn escape_room_prompt() -> String {
    r#"## Mode: Escape Room — The Tower of Babel

### Premise
The student is trapped in the ancient Tower of Babel. To escape, they must ascend through 5 rooms, each testing a different language skill. Use dramatic, immersive narration to set the scene.

### Room Progression

**Room 1: The Lexicon Gate**
- Challenge: Vocabulary recognition. Present inscriptions on the wall — the student must translate or define words to unlock the gate.
- Atmosphere: Ancient stone walls with glowing runes. Each correct answer makes a rune light up.
- Pass condition: Correctly translate 5 out of 7 words.

**Room 2: The Fragment Chamber**
- Challenge: Sentence completion. Present sentences with missing words. The student must fill in the blanks.
- Atmosphere: Floating stone fragments that assemble when the student answers correctly.
- Pass condition: Complete 4 out of 6 sentences correctly.

**Room 3: The Scramble Hall**
- Challenge: Word/sentence unscrambling. Present jumbled words or sentences that must be put in correct order.
- Atmosphere: A grand hall with mirrors reflecting scrambled text. Correct answers clear the mirrors.
- Pass condition: Unscramble 4 out of 5 items correctly.

**Room 4: The Grammar Forge**
- Challenge: Grammar transformation. Give a sentence and ask to change tense, voice, or form.
- Atmosphere: A forge with molten metal. Each correct transformation forges a piece of a key.
- Pass condition: Correctly transform 4 out of 6 sentences.

**Room 5: The Final Tribunal**
- Challenge: Free-form composition. The student must write/speak a short paragraph on a given topic using vocabulary from previous rooms.
- Atmosphere: A grand courtroom with ancient judges. They nod approvingly at correct language use.
- Pass condition: Produce a coherent paragraph with at least 3 vocabulary words from earlier rooms and minimal errors.

### Behavior
- Narrate dramatically. Describe the room, the atmosphere, the tension.
- Track the student's progress through rooms. Do not skip rooms.
- When the student completes a room, describe their success dramatically and the door opening to the next room.
- If the student fails a room, give them a second attempt with different items. If they fail again, let them through with encouragement.
- When the student completes Room 5, narrate their triumphant escape from the Tower.
- Adapt challenge difficulty to the student's CEFR level."#.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_modes_returns_five() {
        assert_eq!(list_modes().len(), 5);
    }

    #[test]
    fn test_list_modes_ids_are_unique() {
        let modes = list_modes();
        let mut ids: Vec<&str> = modes.iter().map(|m| m.id.as_str()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), modes.len());
    }

    #[test]
    fn test_mode_prompt_free() {
        let prompt = mode_prompt("free", Some("travel"), None, None);
        assert!(prompt.contains("Free Conversation"));
        assert!(prompt.contains("travel"));
    }

    #[test]
    fn test_mode_prompt_free_no_topic() {
        let prompt = mode_prompt("free", None, None, None);
        assert!(prompt.contains("Choose an interesting topic"));
    }

    #[test]
    fn test_mode_prompt_role_play() {
        let prompt = mode_prompt("role_play", None, Some("You are a waiter at a restaurant"), None);
        assert!(prompt.contains("Role Play"));
        assert!(prompt.contains("waiter"));
    }

    #[test]
    fn test_mode_prompt_deck_practice_with_words() {
        let words = vec!["Haus".to_string(), "Garten".to_string(), "Schule".to_string()];
        let prompt = mode_prompt("deck_practice", None, None, Some(&words));
        assert!(prompt.contains("Deck Practice"));
        assert!(prompt.contains("Haus"));
        assert!(prompt.contains("Garten"));
    }

    #[test]
    fn test_mode_prompt_vocab_challenge() {
        let prompt = mode_prompt("vocab_challenge", None, None, None);
        assert!(prompt.contains("Vocabulary Challenge"));
        assert!(prompt.contains("Score"));
    }

    #[test]
    fn test_mode_prompt_escape_room() {
        let prompt = mode_prompt("escape_room", None, None, None);
        assert!(prompt.contains("Tower of Babel"));
        assert!(prompt.contains("Lexicon Gate"));
        assert!(prompt.contains("Final Tribunal"));
    }

    #[test]
    fn test_unknown_mode_defaults_to_free() {
        let prompt = mode_prompt("unknown_mode", None, None, None);
        assert!(prompt.contains("Free Conversation"));
    }
}
