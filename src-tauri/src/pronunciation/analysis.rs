use super::types::{AnalysisResult, WordScore};

/// Compare user transcript against target text and produce scores.
/// Uses word-level alignment with Levenshtein-based partial credit.
pub fn analyze_pronunciation(target: &str, transcript: &str) -> AnalysisResult {
    let target_words = normalize_words(target);
    let actual_words = normalize_words(transcript);

    let word_scores = align_words(&target_words, &actual_words);

    // ── Phoneme score (60% weight) ──────────────────────
    let phoneme_score = if word_scores.is_empty() {
        0.0
    } else {
        let total: f64 = word_scores.iter().map(|w| w.score).sum();
        total / word_scores.len() as f64
    };

    // ── Fluency score (15% weight) ──────────────────────
    let expected_count = target_words.len() as f64;
    let actual_count = actual_words.len() as f64;
    let speed_ratio = if expected_count > 0.0 {
        actual_count / expected_count
    } else {
        1.0
    };
    // Optimal range: 0.7 – 1.3
    let fluency_score = if speed_ratio >= 0.7 && speed_ratio <= 1.3 {
        100.0
    } else {
        let deviation = if speed_ratio < 0.7 {
            0.7 - speed_ratio
        } else {
            speed_ratio - 1.3
        };
        (100.0 - deviation * 150.0).max(0.0)
    };

    // ── Prosody score (25% weight) ──────────────────────
    // Without pitch analysis we approximate from word match quality
    let correct_count = word_scores.iter().filter(|w| w.status == "correct").count() as f64;
    let prosody_score = if word_scores.is_empty() {
        0.0
    } else {
        (correct_count / word_scores.len() as f64) * 100.0
    };

    // ── Overall ─────────────────────────────────────────
    let overall_score = phoneme_score * 0.60 + prosody_score * 0.25 + fluency_score * 0.15;

    // ── Feedback ────────────────────────────────────────
    let mut feedback = Vec::new();

    let missing: Vec<&str> = word_scores
        .iter()
        .filter(|w| w.status == "missing")
        .map(|w| w.expected.as_str())
        .collect();
    if !missing.is_empty() {
        feedback.push(format!("Missed words: {}", missing.join(", ")));
    }

    let subs: Vec<String> = word_scores
        .iter()
        .filter(|w| w.status == "substitution")
        .map(|w| format!("\"{}\" → \"{}\"", w.expected, w.actual))
        .collect();
    if !subs.is_empty() {
        feedback.push(format!("Mispronounced: {}", subs.join(", ")));
    }

    if overall_score >= 90.0 {
        feedback.push("Excellent pronunciation!".into());
    } else if overall_score >= 70.0 {
        feedback.push("Good effort — keep practicing the highlighted words.".into());
    } else {
        feedback.push("Try speaking more slowly and clearly.".into());
    }

    AnalysisResult {
        transcript: transcript.to_string(),
        overall_score,
        phoneme_score,
        prosody_score,
        fluency_score,
        word_scores,
        feedback,
    }
}

// ── Helpers ─────────────────────────────────────────────

fn normalize_words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric() || *c == '\'')
                .collect::<String>()
                .to_lowercase()
        })
        .filter(|w| !w.is_empty())
        .collect()
}

/// Align expected and actual words using a simple LCS-based approach.
fn align_words(expected: &[String], actual: &[String]) -> Vec<WordScore> {
    let m = expected.len();
    let n = actual.len();

    // Build LCS table
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in 1..=m {
        for j in 1..=n {
            if expected[i - 1] == actual[j - 1] {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = dp[i - 1][j].max(dp[i][j - 1]);
            }
        }
    }

    // Backtrack to build alignment
    let mut result = Vec::new();
    let mut i = m;
    let mut j = n;

    let mut aligned: Vec<(usize, Option<usize>)> = Vec::new(); // (expected_idx, actual_idx)

    while i > 0 && j > 0 {
        if expected[i - 1] == actual[j - 1] {
            aligned.push((i - 1, Some(j - 1)));
            i -= 1;
            j -= 1;
        } else if dp[i - 1][j] >= dp[i][j - 1] {
            aligned.push((i - 1, None));
            i -= 1;
        } else {
            // extra word in actual — skip
            j -= 1;
        }
    }
    while i > 0 {
        aligned.push((i - 1, None));
        i -= 1;
    }

    aligned.reverse();

    for (exp_idx, act_idx) in &aligned {
        let exp_word = &expected[*exp_idx];
        match act_idx {
            Some(ai) => {
                let act_word = &actual[*ai];
                if exp_word == act_word {
                    result.push(WordScore {
                        expected: exp_word.clone(),
                        actual: act_word.clone(),
                        score: 100.0,
                        status: "correct".into(),
                    });
                } else {
                    let sim = word_similarity(exp_word, act_word);
                    result.push(WordScore {
                        expected: exp_word.clone(),
                        actual: act_word.clone(),
                        score: sim * 100.0,
                        status: "substitution".into(),
                    });
                }
            }
            None => {
                result.push(WordScore {
                    expected: exp_word.clone(),
                    actual: String::new(),
                    score: 0.0,
                    status: "missing".into(),
                });
            }
        }
    }

    result
}

/// Character-level similarity using Levenshtein distance.
fn word_similarity(a: &str, b: &str) -> f64 {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let la = a_chars.len();
    let lb = b_chars.len();

    if la == 0 && lb == 0 {
        return 1.0;
    }

    let mut prev = (0..=lb).collect::<Vec<_>>();
    let mut curr = vec![0; lb + 1];

    for i in 1..=la {
        curr[0] = i;
        for j in 1..=lb {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    let max_len = la.max(lb) as f64;
    1.0 - (prev[lb] as f64 / max_len)
}
