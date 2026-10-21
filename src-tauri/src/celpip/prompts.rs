//! Prompts for locally-generated CELPIP insight.
//!
//! Each prompt pins the output to the SAME JSON shape the FlexiLingo backend
//! returns for that skill. The results UI renders both without branching, so any
//! drift here shows up as a blank panel rather than an error — hence the shapes
//! are spelled out literally and covered by tests.

use super::InsightSkill;

const SYSTEM: &str = "You are a CELPIP examiner and language coach. \
You give specific, actionable feedback grounded ONLY in what the test-taker actually wrote or said. \
Never invent errors that are not in the text. \
Reply with a single JSON object and nothing else.";

pub fn system_prompt() -> &'static str {
    SYSTEM
}

/// The exact JSON schema the model must emit for a skill.
///
/// Mirrors `ExamInsight` in `flexi-lingo-front/src/features/exam/types.ts`.
pub fn schema_for(skill: InsightSkill) -> &'static str {
    match skill {
        InsightSkill::Listening | InsightSkill::Reading => {
            r#"{
  "wrong_count": <int>,
  "total_count": <int>,
  "question_analyses": [
    {
      "part_index": <int>,
      "question_index": <int>,
      "question_text": "<the question>",
      "user_choice": "<the option they picked>",
      "correct_choice": "<the correct option>",
      "why_correct": "<why the correct option is right, citing the passage/audio>",
      "strategy_tip": "<one concrete tactic to avoid this trap next time>"
    }
  ],
  "section_strategy": "<2-3 sentences of strategy for this whole section>"
}"#
        }
        InsightSkill::Writing => {
            r#"[
  {
    "task_index": <int>,
    "sentence_corrections": [
      { "original": "<their sentence, verbatim>", "corrected": "<fixed sentence>", "rule": "<short grammar rule name>", "explanation": "<why>" }
    ],
    "vocabulary_suggestions": [ { "word": "<word they used>", "better": ["<stronger alternative>", "..."] } ],
    "structure_note": "<how to organize this response better>"
  }
]"#
        }
        InsightSkill::Speaking => {
            r#"[
  {
    "task_index": <int>,
    "sentence_corrections": [
      { "original": "<their sentence, verbatim>", "corrected": "<fixed sentence>", "rule": "<short grammar rule name>", "explanation": "<why>" }
    ],
    "fluency_notes": "<pacing, fillers, hesitation, coherence>",
    "vocabulary_improvements": [ { "used": "<word they used>", "suggested": ["<stronger alternative>", "..."] } ]
  }
]"#
        }
        InsightSkill::Summary => {
            r#"{
  "summary": {
    "overall_assessment": "<2-3 sentences on where they stand>",
    "strengths": ["<strength>", "..."],
    "areas_to_improve": ["<area>", "..."]
  },
  "improvement_plan": ["<concrete, ordered step>", "..."]
}"#
        }
    }
}

/// Builds the user message for one skill.
///
/// `context` is the JSON the frontend assembled from the exam results: the wrong
/// answers for MCQ skills, the responses and per-criterion scores for the
/// productive ones, and the per-skill CLB scores for the summary.
pub fn user_prompt(skill: InsightSkill, context: &str, clb_score: Option<f64>) -> String {
    let clb_line = match clb_score {
        Some(clb) => format!(
            "\nThe official CLB score for this section is {clb}. Your feedback must be consistent with it — \
do not claim the response is excellent if the score is low, or vice versa.\n"
        ),
        None => String::new(),
    };

    let task = match skill {
        InsightSkill::Listening => {
            "Analyse the LISTENING questions the test-taker answered incorrectly. \
For every wrong answer explain why the correct option is right and give one strategy tip. \
Do not include questions they answered correctly."
        }
        InsightSkill::Reading => {
            "Analyse the READING questions the test-taker answered incorrectly. \
For every wrong answer explain why the correct option is right and give one strategy tip. \
Do not include questions they answered correctly."
        }
        InsightSkill::Writing => {
            "Analyse each WRITING task response. Quote the test-taker's own sentences verbatim in \
`original`. Only correct sentences that are genuinely wrong or weak — if a task is already strong, \
return an empty `sentence_corrections` array for it."
        }
        InsightSkill::Speaking => {
            "Analyse each SPEAKING task transcript. Quote the test-taker's own sentences verbatim in \
`original`. Transcripts come from speech recognition, so ignore punctuation and capitalisation errors \
and focus on grammar, word choice and fluency."
        }
        InsightSkill::Summary => {
            "Write an overall assessment across all sections the test-taker completed, then an ordered \
improvement plan. Base it strictly on the per-skill scores and findings below."
        }
    };

    format!(
        "{task}\n{clb_line}\nRespond with JSON matching EXACTLY this shape:\n{schema}\n\nExam data:\n{context}",
        schema = schema_for(skill),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcq_schema_names_the_fields_the_ui_reads() {
        for skill in [InsightSkill::Listening, InsightSkill::Reading] {
            let s = schema_for(skill);
            for field in [
                "wrong_count",
                "total_count",
                "question_analyses",
                "part_index",
                "question_index",
                "question_text",
                "user_choice",
                "correct_choice",
                "why_correct",
                "strategy_tip",
                "section_strategy",
            ] {
                assert!(s.contains(field), "{skill:?} schema missing `{field}`");
            }
        }
    }

    #[test]
    fn writing_schema_matches_insight_writing_task() {
        let s = schema_for(InsightSkill::Writing);
        for field in [
            "task_index",
            "sentence_corrections",
            "original",
            "corrected",
            "rule",
            "explanation",
            "vocabulary_suggestions",
            "better",
            "structure_note",
        ] {
            assert!(s.contains(field), "writing schema missing `{field}`");
        }
        // Writing and speaking are ARRAYS of tasks, not objects.
        assert!(s.trim_start().starts_with('['));
    }

    #[test]
    fn speaking_schema_matches_insight_speaking_task() {
        let s = schema_for(InsightSkill::Speaking);
        for field in ["task_index", "fluency_notes", "vocabulary_improvements", "used", "suggested"] {
            assert!(s.contains(field), "speaking schema missing `{field}`");
        }
        assert!(s.trim_start().starts_with('['));
    }

    #[test]
    fn summary_schema_matches_the_ui_contract() {
        let s = schema_for(InsightSkill::Summary);
        for field in [
            "overall_assessment",
            "strengths",
            "areas_to_improve",
            "improvement_plan",
        ] {
            assert!(s.contains(field), "summary schema missing `{field}`");
        }
    }

    #[test]
    fn the_clb_score_is_injected_so_feedback_cannot_contradict_it() {
        let with = user_prompt(InsightSkill::Writing, "{}", Some(7.5));
        assert!(with.contains("7.5"));
        assert!(with.contains("consistent with it"));

        let without = user_prompt(InsightSkill::Writing, "{}", None);
        assert!(!without.contains("consistent with it"));
    }

    #[test]
    fn every_prompt_embeds_its_schema_and_the_context() {
        for skill in [
            InsightSkill::Listening,
            InsightSkill::Reading,
            InsightSkill::Writing,
            InsightSkill::Speaking,
            InsightSkill::Summary,
        ] {
            let p = user_prompt(skill, "CONTEXT_SENTINEL", None);
            assert!(p.contains("CONTEXT_SENTINEL"), "{skill:?} dropped the context");
            assert!(p.contains(schema_for(skill)), "{skill:?} dropped its schema");
        }
    }
}
