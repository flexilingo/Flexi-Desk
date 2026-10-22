//! Sentence practice — the answer judge, run on the learner's OWN AI.
//!
//! The website judges a written sentence on its server. The desktop app never
//! asks that server for a verdict: the model on this computer (or the learner's
//! own key, `read_ai_settings`) reads the answer and fills in a scorecard, and
//! the rule that turns the scorecard into accepted / not accepted is in code
//! here, the same rule the website applies to its judge's answers:
//!
//!   accepted = meaning && grammar && elision != false && spelling != typos
//!   a missing accent is forgiven (grammar follows meaning); a misspelled word is not.
//!
//! Failure is an `Err` carrying the provider's own error code (`OLLAMA_NOT_RUNNING`,
//! `AI_KEY_MISSING`, ...), which the screen turns into the AI setup card. The page
//! keeps the static grader's verdict meanwhile.

use serde_json::{json, Value};
use tauri::State;

use crate::ai::json_extractor::extract_json;
use crate::ai::prompts::lang_name;
use crate::ai::provider::{chat_completion, read_ai_settings, ChatMessage};
use crate::AppState;

const SPELLINGS: [&str; 3] = ["ok", "accents", "typos"];
const REGISTERS: [&str; 3] = ["formal", "neutral", "informal"];
const ERROR_TYPES: [&str; 8] = [
    "gender_agreement",
    "verb_conjugation",
    "word_order",
    "preposition_or_article",
    "spelling_or_accent",
    "negation",
    "wrong_word",
    "avoir_expression",
];

fn messages(lang: &str, target: &str, answer: &str) -> Vec<ChatMessage> {
    let language = lang_name(lang);
    vec![
        ChatMessage {
            role: "system".to_string(),
            content: "You are a strict, fair language teacher. Reply with valid JSON only, no markdown. \
                      Only report real mistakes; never invent errors in a correct sentence."
                .to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                r#"A learner of {language} was asked to write this sentence: "{target}"
They wrote: "{answer}"

Judge what they wrote as {language}. It may differ from the expected sentence (another register or wording) and still be correct. Answer these:
- "usable": true when the answer contains at least one attempt at a {language} sentence (false for empty, noise, or another language).
- "meaning": true when it says something sensible that does the same job as the expected sentence.
- "grammar": true when it has no grammar mistake (agreement, conjugation, word order, articles, prepositions, negation).
- "spelling": "ok", "accents" when ONLY accents or diacritics are missing or wrong, or "typos" when a word is misspelled or a wrong word.
- "elision": French only: true when elisions like j'aime / l'ami are right, false when one is missing or wrong; null for every other language.
- "register": "formal", "neutral" or "informal" ONLY when you are confident, else null.
- "natural": true/false whether a native speaker would say it that way, ONLY when you are confident and the sentence is correct, else null.
- "error_type": one of gender_agreement, verb_conjugation, word_order, preposition_or_article, spelling_or_accent, negation, wrong_word, avoir_expression, ONLY when the sentence is wrong and you are confident, else null.

Respond ONLY with a raw JSON object: {{"usable":true,"meaning":true,"grammar":true,"spelling":"ok","elision":null,"register":null,"natural":null,"error_type":null}}"#
            ),
        },
    ]
}

/// The model's answers, shaped into the scorecard the screen draws (the website's
/// `Scorecard`). Nothing the model got wrong about the shape is shown; with no
/// usable answers there is no scorecard at all.
fn scorecard(v: &Value) -> Option<Value> {
    let v = v.as_object()?;
    let usable = v.get("usable").and_then(|x| x.as_bool()).unwrap_or(true);
    let meaning = usable && v.get("meaning").and_then(|x| x.as_bool())?;
    let raw_grammar = usable && v.get("grammar").and_then(|x| x.as_bool())?;
    let spelling = if usable {
        v.get("spelling")
            .and_then(|x| x.as_str())
            .filter(|x| SPELLINGS.contains(x))
            .unwrap_or("ok")
    } else {
        "ok"
    };
    let elision = if usable { v.get("elision").and_then(|x| x.as_bool()) } else { None };
    // Right, with a slip: the only fault is accents. `typos` is never forgiven.
    let grammar = raw_grammar || (usable && meaning && spelling == "accents");
    let accepted = usable && meaning && grammar && elision != Some(false) && spelling != "typos";
    let spelling_points = match spelling {
        "ok" => 10,
        "accents" => 6,
        _ => 3,
    };
    let score = if !usable {
        0
    } else {
        (if meaning { 45 } else { 0 })
            + (if grammar { 35 } else { 0 })
            + spelling_points
            + (if elision == Some(false) { 0 } else { 10 })
    };

    let mut hints = serde_json::Map::new();
    if usable {
        if let Some(r) = v.get("register").and_then(|x| x.as_str()).filter(|x| REGISTERS.contains(x)) {
            hints.insert("register".into(), json!(r));
        }
        if accepted {
            if let Some(n) = v.get("natural").and_then(|x| x.as_bool()) {
                hints.insert("natural".into(), json!(n));
            }
        } else if let Some(e) = v.get("error_type").and_then(|x| x.as_str()).filter(|x| ERROR_TYPES.contains(x)) {
            hints.insert("errorType".into(), json!(e));
        }
    }
    Some(json!({
        "accepted": accepted,
        "score": score,
        "criteria": { "meaning": meaning, "grammar": grammar, "spelling": spelling, "elision": elision },
        "hints": hints,
    }))
}

/// Judge a written sentence the exact-match grader did not accept, with the
/// learner's own AI. `Err` means it could not be asked (not set up, not running).
#[tauri::command]
pub async fn sentences_judge(
    state: State<'_, AppState>,
    lang: String,
    target: String,
    answer: String,
) -> Result<Value, String> {
    let target: String = target.chars().take(400).collect();
    let answer: String = answer.chars().take(400).collect();
    if target.trim().is_empty() || answer.trim().is_empty() {
        return Err("INVALID_REQUEST".to_string());
    }
    let settings = {
        let conn = state.db.lock().map_err(|e| format!("DB lock error: {e}"))?;
        read_ai_settings(&conn)
    };
    let raw = chat_completion(
        &settings.provider,
        &settings.model,
        messages(&lang, &target, &answer),
        settings.api_key.as_deref(),
        settings.base_url.as_deref(),
        Some(0.1),
        Some(300),
        true,
    )
    .await?;
    let parsed = extract_json(&raw).map_err(|_| "AI_BAD_REPLY".to_string())?;
    scorecard(&parsed).ok_or_else(|| "AI_BAD_REPLY".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_correct_other_register_is_accepted() {
        let c = scorecard(&json!({"usable":true,"meaning":true,"grammar":true,"spelling":"ok","elision":true,"register":"formal"})).unwrap();
        assert_eq!(c["accepted"], true);
        assert_eq!(c["score"], 100);
        assert_eq!(c["hints"]["register"], "formal");
    }

    #[test]
    fn a_missing_accent_is_forgiven_a_typo_is_not() {
        let accents = scorecard(&json!({"meaning":true,"grammar":false,"spelling":"accents","elision":null})).unwrap();
        assert_eq!(accents["accepted"], true);
        assert_eq!(accents["criteria"]["grammar"], true);
        let typos = scorecard(&json!({"meaning":true,"grammar":true,"spelling":"typos","elision":null})).unwrap();
        assert_eq!(typos["accepted"], false);
    }

    #[test]
    fn a_wrong_elision_or_junk_is_rejected() {
        let elision = scorecard(&json!({"meaning":true,"grammar":true,"spelling":"ok","elision":false})).unwrap();
        assert_eq!(elision["accepted"], false);
        assert_eq!(elision["score"], 90);
        let junk = scorecard(&json!({"usable":false,"meaning":true,"grammar":true})).unwrap();
        assert_eq!(junk["accepted"], false);
        assert_eq!(junk["score"], 0);
    }

    #[test]
    fn a_bad_shape_gives_no_scorecard_and_unknown_hints_are_dropped() {
        assert!(scorecard(&json!({"meaning":true})).is_none());
        assert!(scorecard(&json!("nope")).is_none());
        let c = scorecard(&json!({"meaning":false,"grammar":false,"spelling":"ok","error_type":"made_up","register":"slangy"})).unwrap();
        assert!(c["hints"].as_object().unwrap().is_empty());
        let w = scorecard(&json!({"meaning":false,"grammar":true,"spelling":"ok","error_type":"wrong_word"})).unwrap();
        assert_eq!(w["hints"]["errorType"], "wrong_word");
    }
}
