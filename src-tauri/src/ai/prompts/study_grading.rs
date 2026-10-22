// =============================================================================
// Study engine — use_in_sentence grading + coaching prompt.
// =============================================================================
// Ported from flexi-lingo-core/functions/practice-session/services/ai-grader.ts.
// The cloud path grades acceptability with a BERT-CoLA ONNX microservice and only
// uses an LLM for coaching. Desk has no ONNX service, so we ask the local model
// for both: an `acceptable` verdict plus the same coaching JSON shape the front
// already renders ({corrected, corrections[], examples[]}).
// =============================================================================

use super::lang_name;
use crate::ai::provider::ChatMessage;

pub fn grade_and_coach(
    target: &str,
    sentence: &str,
    native_language: &str,
    learning_language: &str,
) -> Vec<ChatMessage> {
    let native_name = lang_name(native_language);
    let learning_name = lang_name(learning_language);

    vec![
        ChatMessage {
            role: "system".to_string(),
            content: "You are a precise, encouraging language tutor. Always reply with valid JSON only, \
                      no markdown. Only report real mistakes — do not invent errors in a correct sentence."
                .to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                r#"A language learner whose native language is {native_name} is practising {learning_name}. They were asked to use the word "{target}" in a sentence and wrote:

"{sentence}"

Do four things:
1. Decide whether the sentence is acceptable {learning_name} that really uses "{target}" correctly. Be generous with beginners: a sentence with small slips is still acceptable.
2. Find their spelling and grammar mistakes. For each mistake give the wrong form (exactly as they wrote it), the corrected form in {learning_name}, whether it is "spelling" or "grammar", and a short note in {native_name} explaining the fix. If the sentence is already correct, return an empty list.
3. Write one or two short, natural model sentences in {learning_name} that use the word "{target}" well.
4. Fill in the judge's scorecard for the sentence, judged as {learning_name}: "meaning" (does it say something sensible that fits the word), "grammar" (true when there is no grammar mistake), "spelling" ("ok", "accents" when ONLY accents or diacritics are missing, or "typos"), "elision" (French only: true when elisions like j'aime / l'ami are right; null for every other language) and "score" (0-100, how close to a perfect sentence). Add the hints "register", "natural" and "error_type" ONLY when you are confident, otherwise null.

Respond ONLY with a raw JSON object (no markdown) matching exactly:
{{
  "acceptable": true,
  "corrected": "the whole sentence rewritten correctly in {learning_name}, or null if it had no mistakes",
  "corrections": [ {{ "wrong": "...", "right": "...", "kind": "spelling", "note": "explanation in {native_name}" }} ],
  "examples": [ "model sentence in {learning_name}", "optional second one" ],
  "judgement": {{
    "score": 90,
    "meaning": true,
    "grammar": true,
    "spelling": "ok",
    "elision": null,
    "register": null,
    "natural": null,
    "error_type": null
  }}
}}"#
            ),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_judge_prompt_names_the_language_being_learned_and_asks_for_the_scorecard() {
        let m = grade_and_coach("la force", "J'ai la force", "fa", "fr");
        let user = &m[1].content;
        assert!(user.contains("practising French"), "names the learned language");
        assert!(!user.contains("practising English"));
        assert!(user.contains("\"judgement\""));
        assert!(user.contains("\"spelling\""));
        assert!(user.contains("\"elision\""));
    }
}
