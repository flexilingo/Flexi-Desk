//! The website's Writing practice, run on the user's own AI.
//!
//! `rubrics_data` / `prompt_data` are generated from the server's `writing-practice`
//! function so the rubrics and the prompt wording stay identical. This module builds the
//! same prompts, and turns whatever the user's model answers into the exact JSON shape the
//! server stores (`WritingSession`), so the web's graded view renders it unchanged.

pub mod store;
mod prompt_data;
mod rubrics_data;
pub mod types;

use serde_json::{json, Map, Value};

use crate::ai::provider::ChatMessage;
use prompt_data::{EXAM_INSTRUCTIONS, FALLBACKS_JSON};
use rubrics_data::RUBRICS;
use types::Rubric;

pub const MIN_WORDS: usize = 20;
pub const MAX_ESSAY_CHARS: usize = 20_000;

pub fn rubric(exam_type: &str) -> Option<&'static Rubric> {
    RUBRICS.iter().find(|r| r.exam_type == exam_type)
}

pub fn word_count(text: &str) -> usize {
    text.split_whitespace().count()
}

// ── Prompt generation ──────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub struct GeneratedPrompt {
    pub topic: String,
    pub prompt_text: String,
    pub supplementary_data: Option<Value>,
    pub difficulty: String,
}

pub fn build_prompt_messages(r: &Rubric, difficulty: Option<&str>) -> Vec<ChatMessage> {
    let instruction = EXAM_INSTRUCTIONS
        .iter()
        .find(|(k, _)| *k == r.exam_type)
        .map(|(_, v)| *v)
        .unwrap_or("Generate a writing prompt.");
    let system = format!(
        "You are an expert English language exam designer specializing in {}.\n\
Generate realistic, exam-appropriate writing prompts that test the skills expected at this level.\n\
Always respond with valid JSON only.",
        r.display_name
    );
    let difficulty_line = match difficulty.filter(|d| !d.trim().is_empty()) {
        Some(d) => format!("Difficulty level: {d}"),
        None => "Difficulty: intermediate".to_string(),
    };
    let user = format!(
        "{instruction}\n\n{difficulty_line}\nWord count expected: {}-{} words\nTime allowed: {} minutes\n\n\
Respond with this exact JSON structure:\n{{\n  \"topic\": \"short topic label (3-6 words)\",\n  \
\"prompt_text\": \"full prompt instructions as the student would see them\",\n  \
\"supplementary_data\": null or {{ relevant extra data like reading passages, chart descriptions }},\n  \
\"difficulty\": \"beginner\" | \"intermediate\" | \"advanced\"\n}}\n\n\
Make the prompt unique and engaging. Avoid overused topics.",
        r.word_min,
        r.word_max,
        (r.time_limit_seconds as f64 / 60.0).round() as i64,
    );
    vec![
        ChatMessage { role: "system".into(), content: system },
        ChatMessage { role: "user".into(), content: user },
    ]
}

fn clean_supplementary(v: Option<&Value>) -> Option<Value> {
    let obj = v?.as_object()?;
    let mut out = Map::new();
    for (k, val) in obj {
        match val {
            Value::String(s) if !s.trim().is_empty() => {
                out.insert(k.clone(), Value::String(s.trim().to_string()));
            }
            Value::Number(_) | Value::Bool(_) => {
                out.insert(k.clone(), Value::String(val.to_string()));
            }
            // A model sometimes returns a list of data points; keep them readable.
            Value::Array(items) => {
                let joined = items
                    .iter()
                    .map(|i| i.as_str().map(str::to_string).unwrap_or_else(|| i.to_string()))
                    .collect::<Vec<_>>()
                    .join("\n");
                if !joined.trim().is_empty() {
                    out.insert(k.clone(), Value::String(joined));
                }
            }
            _ => {}
        }
    }
    if out.is_empty() { None } else { Some(Value::Object(out)) }
}

/// Reads the model's answer. `None` when it lacks the two fields the server also requires.
pub fn parse_generated_prompt(v: &Value) -> Option<GeneratedPrompt> {
    let topic = v.get("topic")?.as_str()?.trim().to_string();
    let prompt_text = v.get("prompt_text")?.as_str()?.trim().to_string();
    if topic.is_empty() || prompt_text.is_empty() {
        return None;
    }
    let difficulty = match v.get("difficulty").and_then(|d| d.as_str()) {
        Some(d @ ("beginner" | "intermediate" | "advanced")) => d.to_string(),
        _ => "intermediate".to_string(),
    };
    Some(GeneratedPrompt {
        topic,
        prompt_text,
        supplementary_data: clean_supplementary(v.get("supplementary_data")),
        difficulty,
    })
}

/// The server's canned prompt for an exam, used when the model's answer is unusable.
pub fn fallback_prompt(exam_type: &str) -> GeneratedPrompt {
    let all: Value = serde_json::from_str(FALLBACKS_JSON).unwrap_or(Value::Null);
    let pick = all.get(exam_type).or_else(|| all.get("general_essay"));
    pick.and_then(|p| {
        Some(GeneratedPrompt {
            topic: p.get("topic")?.as_str()?.to_string(),
            prompt_text: p.get("prompt_text")?.as_str()?.to_string(),
            supplementary_data: p.get("supplementary_data").cloned().filter(|s| s.is_object()),
            difficulty: p
                .get("difficulty")
                .and_then(|d| d.as_str())
                .unwrap_or("intermediate")
                .to_string(),
        })
    })
    .unwrap_or_else(|| GeneratedPrompt {
        topic: "Importance of Reading Books".into(),
        prompt_text: "Do you think reading books is still important? Why or why not?".into(),
        supplementary_data: None,
        difficulty: "intermediate".into(),
    })
}

/// A `WritingPrompt` as the web stores it.
pub fn prompt_json(id: &str, exam_type: &str, g: &GeneratedPrompt, source: &str, now: &str) -> Value {
    json!({
        "id": id,
        "exam_type": exam_type,
        "topic": g.topic,
        "prompt_text": g.prompt_text,
        "difficulty": g.difficulty,
        "source": source,
        "supplementary_data": g.supplementary_data,
        "is_active": true,
        "usage_count": 0,
        "created_at": now,
    })
}

// ── Grading ────────────────────────────────────────────────

pub fn build_grade_messages(
    r: &Rubric,
    prompt_text: &str,
    supplementary: Option<&Value>,
    essay: &str,
) -> Vec<ChatMessage> {
    let criteria_list = r
        .criteria
        .iter()
        .map(|c| format!("- {} (max {}): {}", c.name, fmt_num(c.max_score), c.description))
        .collect::<Vec<_>>()
        .join("\n");
    let band_section = if r.band_descriptors.is_empty() {
        String::new()
    } else {
        format!(
            "\n## Band Level Descriptors (use these to calibrate your scoring):\n{}\n",
            r.band_descriptors
                .iter()
                .map(|(b, d)| format!("- {b}: {d}"))
                .collect::<Vec<_>>()
                .join("\n")
        )
    };
    let supplementary_block = match supplementary {
        Some(s) if !s.is_null() => format!(
            "\n## Supplementary Material:\n{}",
            serde_json::to_string_pretty(s).unwrap_or_default()
        ),
        _ => String::new(),
    };
    let criteria_json = r
        .criteria
        .iter()
        .map(|c| format!("    \"{}\": <number 0-{}>", c.name, fmt_num(c.max_score)))
        .collect::<Vec<_>>()
        .join(",\n");
    let (smin, smax, step) = (fmt_num(r.score_min), fmt_num(r.score_max), fmt_num(r.score_step));

    let system = format!(
        "You are an expert {} writing examiner with years of experience grading official exams.\n\
Grade the essay strictly but fairly using the official rubric criteria.\n\
Always respond with valid JSON only.",
        r.display_name
    );
    let user = format!(
        "Grade this {name} essay.\n\n## Writing Prompt Given to Student:\n{prompt_text}\n{supplementary_block}\n\n\
## Student's Essay:\n{essay}\n\n## Rubric Criteria:\n{criteria_list}\n{band_section}\n\
## Scoring:\n- Score range: {smin}-{smax} in steps of {step}\n- Expected word count: {wmin}-{wmax} words\n\
- Overall score = average of criteria scores (rounded to nearest {step})\n\n\
## Required JSON Response:\n{{\n  \"overall_score\": <number within {smin}-{smax}>,\n  \"criteria_scores\": {{\n{criteria_json}\n  }},\n  \"feedback\": {{\n    \
\"summary\": \"<2-3 sentence overall assessment>\",\n    \
\"strengths\": [\"<specific strength 1>\", \"<specific strength 2>\", \"<specific strength 3>\"],\n    \
\"weaknesses\": [\"<specific weakness 1>\", \"<specific weakness 2>\"],\n    \"error_highlights\": [\n      \
{{\"text\": \"<exact text from essay>\", \"correction\": \"<corrected version>\", \"type\": \"grammar|vocabulary|spelling|punctuation\", \"explanation\": \"<brief explanation>\"}}\n    ],\n    \
\"suggestions\": [\"<actionable improvement suggestion 1>\", \"<actionable suggestion 2>\", \"<actionable suggestion 3>\"]\n  }},\n  \
\"vocabulary_analysis\": {{\n    \"estimated_cefr\": \"<A1|A2|B1|B2|C1|C2 - overall vocabulary level used in the essay>\",\n    \
\"lexical_diversity\": <0.0-1.0 type-token ratio>,\n    \"advanced_words\": [\"<list up to 8 C1/C2 level words the student used>\"],\n    \
\"suggested_upgrades\": [{{\"original\": \"<basic word used>\", \"upgrade\": \"<more advanced/precise alternative>\"}}]\n  }},\n  \
\"ai_rewritten_version\": \"<full improved version of the essay maintaining the student's ideas but with corrected language, better structure, and enhanced vocabulary>\"\n}}\n\n\
Important:\n- Be specific in feedback (cite actual phrases from the essay)\n- Provide at least 3-5 error_highlights with exact text matches\n\
- The ai_rewritten_version should preserve the student's ideas but improve language quality\n\
- For vocabulary_analysis, estimate the CEFR level based on actual vocabulary complexity used\n\
- Grade strictly according to official {name} standards",
        name = r.display_name,
        wmin = r.word_min,
        wmax = r.word_max,
    );
    vec![
        ChatMessage { role: "system".into(), content: system },
        ChatMessage { role: "user".into(), content: user },
    ]
}

/// `9` not `9.0`, `0.5` stays: how the server prints numbers into the prompt.
fn fmt_num(n: f64) -> String {
    if n.fract() == 0.0 { format!("{}", n as i64) } else { format!("{n}") }
}

fn round_to_step(value: f64, step: f64) -> f64 {
    if step <= 0.0 { value } else { (value / step).round() * step }
}

fn clamp(value: f64, lo: f64, hi: f64) -> f64 {
    value.max(lo).min(hi)
}

/// Type-token ratio of the essay, 0.0 to 1.0, rounded to two places.
pub fn lexical_diversity(text: &str) -> f64 {
    let words: Vec<String> = text
        .split_whitespace()
        .map(|w| {
            w.trim_matches(|c: char| !c.is_alphanumeric() && c != '\'')
                .to_lowercase()
        })
        .filter(|w| !w.is_empty())
        .collect();
    if words.is_empty() {
        return 0.0;
    }
    let unique: std::collections::HashSet<&String> = words.iter().collect();
    ((unique.len() as f64 / words.len() as f64) * 100.0).round() / 100.0
}

fn string_list(v: Option<&Value>, max: usize) -> Vec<String> {
    v.and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|i| i.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .take(max)
                .collect()
        })
        .unwrap_or_default()
}

fn number_of(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

/// Where the grade came from, for the small badge on the graded view.
pub struct GradedBy<'a> {
    pub model: &'a str,
    /// `device` (the model on this computer) or `own_key`.
    pub origin: &'a str,
}

/// Turns the model's JSON into the server's graded shape:
/// `{ overall_score, criteria_scores, feedback{..., vocabulary_analysis, grading_meta}, ai_rewritten_version }`.
/// Errors with `WRITING_GRADING_FAILED` when the answer has no usable criteria scores or feedback.
pub fn normalize_grading(
    raw: &Value,
    r: &Rubric,
    essay: &str,
    by: &GradedBy,
) -> Result<Value, String> {
    let fail = || "WRITING_GRADING_FAILED".to_string();
    let obj = raw.as_object().ok_or_else(fail)?;
    let feedback_in = obj.get("feedback").and_then(|f| f.as_object()).ok_or_else(fail)?;
    let scores_in = obj.get("criteria_scores").and_then(|c| c.as_object()).ok_or_else(fail)?;

    // Criteria the rubric knows, in rubric order; a model that spells a name differently still counts.
    let mut criteria = Map::new();
    for c in r.criteria {
        let found = scores_in
            .iter()
            .find(|(k, _)| k.trim().eq_ignore_ascii_case(c.name) || k.replace('_', " ").eq_ignore_ascii_case(c.name))
            .and_then(|(_, v)| number_of(v));
        if let Some(n) = found {
            let n = round_to_step(clamp(n, 0.0, c.max_score), r.score_step);
            criteria.insert(c.name.to_string(), json!(clamp(n, 0.0, c.max_score)));
        }
    }
    if criteria.is_empty() {
        return Err(fail());
    }

    let overall_raw = obj.get("overall_score").and_then(number_of).unwrap_or_else(|| {
        let sum: f64 = criteria.values().filter_map(|v| v.as_f64()).sum();
        sum / criteria.len() as f64
    });
    let overall = clamp(round_to_step(overall_raw, r.score_step), r.score_min, r.score_max);

    let mut errors = Vec::new();
    let essay_lower = essay.to_lowercase();
    if let Some(items) = feedback_in.get("error_highlights").and_then(|e| e.as_array()) {
        for item in items {
            let text = item.get("text").and_then(|t| t.as_str()).unwrap_or("").trim();
            let correction = item.get("correction").and_then(|t| t.as_str()).unwrap_or("").trim();
            // A weaker model sometimes quotes text the student never wrote: drop those.
            if text.is_empty() || correction.is_empty() || !essay_lower.contains(&text.to_lowercase()) {
                continue;
            }
            let kind = match item.get("type").and_then(|t| t.as_str()).map(str::to_lowercase).as_deref() {
                Some("vocabulary") => "vocabulary",
                Some("spelling") => "spelling",
                Some("punctuation") => "punctuation",
                _ => "grammar",
            };
            errors.push(json!({
                "text": text,
                "correction": correction,
                "type": kind,
                "explanation": item.get("explanation").and_then(|t| t.as_str()).unwrap_or("").trim(),
                "source": "ai",
            }));
        }
    }

    let va_in = obj.get("vocabulary_analysis").and_then(|v| v.as_object());
    let cefr = va_in
        .and_then(|v| v.get("estimated_cefr"))
        .and_then(|c| c.as_str())
        .map(|c| c.trim().to_uppercase())
        .filter(|c| matches!(c.as_str(), "A1" | "A2" | "B1" | "B2" | "C1" | "C2"));
    let vocabulary_analysis = cefr.map(|cefr| {
        let upgrades: Vec<Value> = va_in
            .and_then(|v| v.get("suggested_upgrades"))
            .and_then(|u| u.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|u| {
                        let o = u.get("original")?.as_str()?.trim();
                        let g = u.get("upgrade")?.as_str()?.trim();
                        (!o.is_empty() && !g.is_empty()).then(|| json!({ "original": o, "upgrade": g }))
                    })
                    .collect()
            })
            .unwrap_or_default();
        json!({
            "estimated_cefr": cefr,
            // Counted from the essay itself: a model's own "type-token ratio" is a guess.
            "lexical_diversity": lexical_diversity(essay),
            "advanced_words": string_list(va_in.and_then(|v| v.get("advanced_words")), 8),
            "suggested_upgrades": upgrades,
        })
    });

    let mut feedback = Map::new();
    feedback.insert(
        "summary".into(),
        json!(feedback_in.get("summary").and_then(|s| s.as_str()).unwrap_or("").trim()),
    );
    feedback.insert("strengths".into(), json!(string_list(feedback_in.get("strengths"), 8)));
    feedback.insert("weaknesses".into(), json!(string_list(feedback_in.get("weaknesses"), 8)));
    feedback.insert("error_highlights".into(), Value::Array(errors));
    feedback.insert("suggestions".into(), json!(string_list(feedback_in.get("suggestions"), 8)));
    if let Some(va) = vocabulary_analysis {
        feedback.insert("vocabulary_analysis".into(), va);
    }
    feedback.insert(
        "grading_meta".into(),
        json!({
            "model": by.model,
            "quality": "standard",
            "double_graded": false,
            "origin": by.origin,
        }),
    );

    Ok(json!({
        "overall_score": overall,
        "criteria_scores": Value::Object(criteria),
        "feedback": Value::Object(feedback),
        "ai_rewritten_version": obj.get("ai_rewritten_version").and_then(|s| s.as_str()).unwrap_or("").trim(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ielts2() -> &'static Rubric {
        rubric("ielts_task2").unwrap()
    }

    #[test]
    fn every_exam_has_a_rubric_instruction_and_fallback() {
        for r in RUBRICS {
            assert!(!r.criteria.is_empty(), "{} has criteria", r.exam_type);
            assert!(EXAM_INSTRUCTIONS.iter().any(|(k, _)| *k == r.exam_type));
            let f = fallback_prompt(r.exam_type);
            assert!(!f.topic.is_empty() && !f.prompt_text.is_empty());
        }
        assert_eq!(RUBRICS.len(), 13);
        assert!(rubric("nope").is_none());
    }

    #[test]
    fn fallback_keeps_chart_description_for_task_one() {
        let f = fallback_prompt("ielts_task1");
        let chart = f.supplementary_data.unwrap();
        assert!(chart["chart_description"].as_str().unwrap().contains("Bar chart"));
        let t = fallback_prompt("toefl_integrated").supplementary_data.unwrap();
        assert!(t["reading_passage"].is_string() && t["lecture_summary"].is_string());
    }

    #[test]
    fn prompt_messages_carry_exam_instruction_difficulty_and_limits() {
        let m = build_prompt_messages(rubric("celpip").unwrap(), Some("advanced"));
        assert_eq!(m[0].role, "system");
        assert!(m[0].content.contains("CELPIP Writing"));
        assert!(m[1].content.contains("Difficulty level: advanced"));
        assert!(m[1].content.contains("150-200 words"));
        assert!(m[1].content.contains("27 minutes"));
        let d = build_prompt_messages(rubric("celpip").unwrap(), None);
        assert!(d[1].content.contains("Difficulty: intermediate"));
    }

    #[test]
    fn generated_prompt_needs_topic_and_text_and_defaults_difficulty() {
        let good = json!({"topic":"Tech","prompt_text":"Discuss.","supplementary_data":{"chart_description":"Bars","n":5,"x":null},"difficulty":"weird"});
        let g = parse_generated_prompt(&good).unwrap();
        assert_eq!(g.difficulty, "intermediate");
        let s = g.supplementary_data.unwrap();
        assert_eq!(s["chart_description"], "Bars");
        assert_eq!(s["n"], "5");
        assert!(s.get("x").is_none());
        assert!(parse_generated_prompt(&json!({"topic":"x"})).is_none());
        assert!(parse_generated_prompt(&json!({"topic":" ","prompt_text":"y"})).is_none());
        assert!(parse_generated_prompt(&json!({"topic":"a","prompt_text":"b","supplementary_data":null}))
            .unwrap()
            .supplementary_data
            .is_none());
    }

    #[test]
    fn prompt_json_has_the_web_shape() {
        let g = fallback_prompt("celpip");
        let p = prompt_json("p1", "celpip", &g, "ai", "2026-01-01T00:00:00Z");
        for k in ["id", "exam_type", "topic", "prompt_text", "difficulty", "source", "supplementary_data", "is_active", "usage_count", "created_at"] {
            assert!(p.get(k).is_some(), "missing {k}");
        }
    }

    #[test]
    fn grade_messages_use_the_server_rubric_text() {
        let m = build_grade_messages(ielts2(), "Write about X.", None, "My essay here.");
        let u = &m[1].content;
        assert!(u.contains("Grade this IELTS Academic Task 2 essay."));
        assert!(u.contains("- Task Response (max 9):"));
        assert!(u.contains("Score range: 0-9 in steps of 0.5"));
        assert!(u.contains("\"Lexical Resource\": <number 0-9>"));
        assert!(u.contains("Band 7"));
        assert!(u.contains("## Student's Essay:\nMy essay here."));
        assert!(!u.contains("Supplementary Material"));
        let sup = json!({"chart_description":"Bars"});
        let with = build_grade_messages(ielts2(), "p", Some(&sup), "e");
        assert!(with[1].content.contains("## Supplementary Material:"));
    }

    fn essay() -> String {
        "I has a dog. It are very big and I like it much because it make me happy every day of the week.".to_string()
    }

    fn model_answer() -> Value {
        json!({
            "overall_score": 6.3,
            "criteria_scores": {"Task Response": 6, "Coherence and Cohesion": "6.5", "Lexical Resource": 7, "grammatical range and accuracy": 5.5},
            "feedback": {
                "summary": "A clear essay.",
                "strengths": ["Clear topic", " "],
                "weaknesses": ["Verb forms"],
                "error_highlights": [
                    {"text": "I has", "correction": "I have", "type": "GRAMMAR", "explanation": "Subject-verb agreement"},
                    {"text": "never written", "correction": "x", "type": "grammar", "explanation": "not in essay"},
                    {"text": "It are", "correction": "It is", "type": "weird", "explanation": ""}
                ],
                "suggestions": ["Review verb forms"]
            },
            "vocabulary_analysis": {"estimated_cefr": "b1", "lexical_diversity": 0.9, "advanced_words": ["a","b","c","d","e","f","g","h","i","j"], "suggested_upgrades": [{"original":"big","upgrade":"enormous"},{"original":"x"}]},
            "ai_rewritten_version": "I have a dog."
        })
    }

    #[test]
    fn grading_is_normalised_to_the_server_shape() {
        let by = GradedBy { model: "llama3.2", origin: "device" };
        let g = normalize_grading(&model_answer(), ielts2(), &essay(), &by).unwrap();
        // overall rounded to the 0.5 step and inside the range
        assert_eq!(g["overall_score"], 6.5);
        let cs = g["criteria_scores"].as_object().unwrap();
        assert_eq!(cs.len(), 4);
        assert_eq!(cs["Coherence and Cohesion"], 6.5);
        assert_eq!(cs["Grammatical Range and Accuracy"], 5.5);
        let f = &g["feedback"];
        assert_eq!(f["strengths"], json!(["Clear topic"]));
        // the invented quote is dropped; an unknown type becomes grammar; source is "ai"
        let errs = f["error_highlights"].as_array().unwrap();
        assert_eq!(errs.len(), 2);
        assert_eq!(errs[0]["type"], "grammar");
        assert_eq!(errs[1]["type"], "grammar");
        assert_eq!(errs[0]["source"], "ai");
        let va = &f["vocabulary_analysis"];
        assert_eq!(va["estimated_cefr"], "B1");
        assert_eq!(va["advanced_words"].as_array().unwrap().len(), 8);
        assert_eq!(va["suggested_upgrades"].as_array().unwrap().len(), 1);
        let ld = va["lexical_diversity"].as_f64().unwrap();
        assert!((0.0..=1.0).contains(&ld));
        assert_eq!(f["grading_meta"]["quality"], "standard");
        assert_eq!(f["grading_meta"]["double_graded"], false);
        assert_eq!(f["grading_meta"]["origin"], "device");
        assert_eq!(g["ai_rewritten_version"], "I have a dog.");
        // exactly the keys the web reads
        for k in ["summary", "strengths", "weaknesses", "error_highlights", "suggestions"] {
            assert!(f.get(k).is_some(), "feedback.{k}");
        }
    }

    #[test]
    fn score_is_clamped_and_derived_when_missing() {
        let by = GradedBy { model: "m", origin: "own_key" };
        let mut a = model_answer();
        a["overall_score"] = json!(42);
        assert_eq!(normalize_grading(&a, ielts2(), &essay(), &by).unwrap()["overall_score"], 9.0);
        a.as_object_mut().unwrap().remove("overall_score");
        // average of 6, 6.5, 7, 5.5 = 6.25 -> 6.5 on the half-band step
        assert_eq!(normalize_grading(&a, ielts2(), &essay(), &by).unwrap()["overall_score"], 6.5);
        // CELPIP scores stay whole numbers inside 1-12
        let c = json!({"overall_score": 0, "criteria_scores": {"Vocabulary": 40}, "feedback": {"summary": "s"}});
        let g = normalize_grading(&c, rubric("celpip").unwrap(), "x y z", &by).unwrap();
        assert_eq!(g["overall_score"], 1.0);
        assert_eq!(g["criteria_scores"]["Vocabulary"], 12.0);
    }

    #[test]
    fn unusable_answers_fail_with_a_code() {
        let by = GradedBy { model: "m", origin: "device" };
        for bad in [
            json!("text"),
            json!({"overall_score": 5}),
            json!({"criteria_scores": {"Nope": 3}, "feedback": {}}),
            json!({"criteria_scores": {"Vocabulary": 3}}),
        ] {
            assert_eq!(
                normalize_grading(&bad, rubric("celpip").unwrap(), "e", &by).unwrap_err(),
                "WRITING_GRADING_FAILED"
            );
        }
    }

    #[test]
    fn vocabulary_analysis_is_left_out_when_the_level_is_not_a_cefr_level() {
        let by = GradedBy { model: "m", origin: "device" };
        let mut a = model_answer();
        a["vocabulary_analysis"]["estimated_cefr"] = json!("advanced");
        let g = normalize_grading(&a, ielts2(), &essay(), &by).unwrap();
        assert!(g["feedback"].get("vocabulary_analysis").is_none());
    }

    #[test]
    fn counts_words_and_diversity() {
        assert_eq!(word_count("  one two\nthree  "), 3);
        assert_eq!(lexical_diversity(""), 0.0);
        assert_eq!(lexical_diversity("the the the the"), 0.25);
        assert_eq!(lexical_diversity("a b c d"), 1.0);
    }
}
