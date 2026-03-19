use crate::ai::provider::ChatMessage;

/// Build the messages array for writing/essay evaluation.
///
/// The AI should return JSON with: overall_score, grammar_score, vocabulary_score,
/// coherence_score, task_score, cefr_level, corrected_text, feedback, corrections,
/// vocabulary_analysis.
pub fn build_messages(
    essay_text: &str,
    exam_type: &str,
    prompt_text: &str,
) -> Vec<ChatMessage> {
    let system = ChatMessage {
        role: "system".to_string(),
        content: format!(
            "You are an expert {exam_type} writing examiner with years of experience grading essays. \
             Always respond with valid JSON only. Be fair, detailed, and constructive in your evaluation."
        ),
    };

    let user = ChatMessage {
        role: "user".to_string(),
        content: format!(
            r#"Evaluate this {exam_type} writing submission.

Task/Prompt: {prompt_text}

Student's essay:
---
{essay_text}
---

Respond with a JSON object:
{{
  "overall_score": <number 0-100>,
  "grammar_score": <number 0-100>,
  "vocabulary_score": <number 0-100>,
  "coherence_score": <number 0-100>,
  "task_score": <number 0-100>,
  "cefr_level": "A1/A2/B1/B2/C1/C2",
  "corrected_text": "the full essay with corrections applied",
  "feedback": "overall feedback paragraph",
  "corrections": [
    {{
      "original": "incorrect text span",
      "corrected": "corrected text span",
      "type": "grammar/spelling/punctuation/vocabulary/style/coherence",
      "explanation": "why this correction was made"
    }}
  ],
  "vocabulary_analysis": {{
    "level": "A1/A2/B1/B2/C1/C2",
    "strengths": ["strong vocabulary areas"],
    "improvements": ["suggested vocabulary improvements"],
    "advanced_alternatives": [
      {{
        "original": "basic word used",
        "suggestion": "more advanced alternative",
        "context": "how to use it in context"
      }}
    ]
  }}
}}"#,
        ),
    };

    vec![system, user]
}
