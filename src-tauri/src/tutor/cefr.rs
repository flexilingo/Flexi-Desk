/// CEFR-specific behavior instructions for the AI tutor.
/// Each level adjusts vocabulary range, complexity, hint frequency,
/// correction style, and words introduced per exchange.

pub fn cefr_prompt(level: &str) -> String {
    match level {
        "A1" => r#"## CEFR Level: A1 (Beginner)
- Vocabulary range: ~500 most common words only (greetings, numbers, colors, family, food, basic objects).
- Sentence complexity: Use only simple, short sentences (Subject + Verb + Object). No subordinate clauses.
- Hints: Provide frequent hints in the student's native language. Translate key words inline after using them.
- Correction style: Be very gentle. Only correct critical errors that block understanding. Praise every attempt.
- New words per exchange: Introduce at most 1 new word, always with immediate translation.
- Repeat key vocabulary often across exchanges to reinforce retention.
- Use present tense only. Avoid idioms, slang, or abstract concepts."#.to_string(),

        "A2" => r#"## CEFR Level: A2 (Elementary)
- Vocabulary range: ~1,000 words covering everyday topics (shopping, daily routine, weather, directions).
- Sentence complexity: Simple sentences with basic connectors (and, but, because). Occasional compound sentences.
- Hints: Provide native language hints for new or unfamiliar words. Reduce hints for previously introduced vocabulary.
- Correction style: Gentle corrections. Focus on high-frequency grammar patterns (verb conjugation, articles, word order).
- New words per exchange: Introduce 1-2 new words with translations.
- Use present and past tense. Introduce simple future constructions.
- Keep explanations short and concrete with real-life examples."#.to_string(),

        "B1" => r#"## CEFR Level: B1 (Intermediate)
- Vocabulary range: ~2,500 words including opinions, experiences, plans, and familiar topics.
- Sentence complexity: Use compound and some complex sentences. Introduce relative clauses and conditionals.
- Hints: Occasional native language hints only for abstract or uncommon words. Encourage guessing from context.
- Correction style: Moderate corrections. Point out recurring patterns of errors. Explain grammar rules briefly.
- New words per exchange: Introduce 1-2 new words, sometimes without immediate translation to encourage inference.
- Introduce common idioms and collocations.
- Use all major tenses. Begin introducing subjunctive/conditional forms where relevant."#.to_string(),

        "B2" => r#"## CEFR Level: B2 (Upper Intermediate)
- Vocabulary range: ~5,000 words including abstract concepts, professional topics, and nuanced expression.
- Sentence complexity: Use complex sentence structures freely. Include passive voice, reported speech, and advanced conditionals.
- Hints: No native language hints. If the student is stuck, rephrase in simpler target language instead.
- Correction style: Direct but supportive corrections. Address stylistic issues, register appropriateness, and subtle grammar errors.
- New words per exchange: Introduce 2 new words, expect the student to infer meaning from context.
- Use idiomatic expressions naturally. Discuss abstract topics.
- Challenge with opinion questions that require argumentation and justification."#.to_string(),

        "C1" => r#"## CEFR Level: C1 (Advanced)
- Vocabulary range: ~10,000 words including idiomatic, colloquial, and specialized vocabulary.
- Sentence complexity: Native-like complexity. Use sophisticated structures, implicit meanings, and cultural references.
- Hints: Never use native language. If clarification is needed, explain using synonyms or definitions in the target language.
- Correction style: Focus on stylistic refinement, register shifts, and subtle nuance. Correct naturalness issues.
- New words per exchange: Introduce 2-3 advanced or low-frequency words.
- Discuss complex topics: politics, philosophy, technical subjects.
- Point out differences between formal/informal registers. Introduce literary or archaic expressions when relevant."#.to_string(),

        "C2" => r#"## CEFR Level: C2 (Mastery)
- Vocabulary range: Full native-level vocabulary including rare expressions, technical jargon, and literary language.
- Sentence complexity: No restrictions. Use any structure a native speaker would use.
- Hints: Never use native language. Treat the student as a near-native speaker.
- Correction style: Focus on stylistic polish, cultural appropriateness, humor, wordplay, and register mastery.
- New words per exchange: Introduce 2-3 rare, literary, or highly specialized words.
- Engage in sophisticated discussion: debate, satire, cultural critique, wordplay.
- Challenge with ambiguity, irony, and double meanings. Discuss etymology when interesting."#.to_string(),

        _ => format!(
            "## CEFR Level: {level}\nAdapt vocabulary, complexity, and correction style to the student's apparent level based on their responses."
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_cefr_levels_return_nonempty() {
        for level in &["A1", "A2", "B1", "B2", "C1", "C2"] {
            let prompt = cefr_prompt(level);
            assert!(!prompt.is_empty(), "Empty prompt for level {level}");
            assert!(prompt.contains(level), "Prompt for {level} should mention the level");
        }
    }

    #[test]
    fn test_a1_mentions_native_language_hints() {
        let prompt = cefr_prompt("A1");
        assert!(prompt.contains("native language"));
    }

    #[test]
    fn test_b2_no_native_hints() {
        let prompt = cefr_prompt("B2");
        assert!(prompt.contains("No native language hints"));
    }

    #[test]
    fn test_c2_full_vocabulary() {
        let prompt = cefr_prompt("C2");
        assert!(prompt.contains("Full native-level"));
    }

    #[test]
    fn test_unknown_level_fallback() {
        let prompt = cefr_prompt("X9");
        assert!(prompt.contains("X9"));
        assert!(prompt.contains("Adapt"));
    }
}
