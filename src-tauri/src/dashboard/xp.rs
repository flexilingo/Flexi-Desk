/// Centralized XP calculation rules for all modules.
pub struct XPRules;

impl XPRules {
    // ── SRS ───────────────────────────────────────
    pub fn review_card(correct: bool) -> i64 {
        if correct { 10 } else { 3 }
    }

    pub fn complete_session(total_cards: i64, correct: i64) -> i64 {
        let accuracy = if total_cards > 0 {
            correct as f64 / total_cards as f64
        } else {
            0.0
        };
        20 + (accuracy * 30.0) as i64
    }

    // ── Reading ───────────────────────────────────
    pub fn reading_words(word_count: i64) -> i64 {
        (word_count / 100) * 5
    }

    pub fn reading_highlight() -> i64 {
        2
    }

    // ── Writing ───────────────────────────────────
    pub fn writing_submit(word_count: i64) -> i64 {
        25 + (word_count / 50) * 5
    }

    // ── Pronunciation ─────────────────────────────
    pub fn pronunciation_attempt(score: f64) -> i64 {
        5 + (score * 15.0) as i64
    }

    // ── Caption ───────────────────────────────────
    pub fn caption_session(duration_seconds: i64) -> i64 {
        ((duration_seconds / 60) * 3).min(60)
    }

    // ── Podcast ───────────────────────────────────
    pub fn podcast_listen(duration_seconds: i64) -> i64 {
        ((duration_seconds / 60) * 2).min(40)
    }

    // ── Exam ──────────────────────────────────────
    pub fn exam_complete(score: f64, total_questions: i64) -> i64 {
        30 + (score * 50.0) as i64 + (total_questions / 10) * 5
    }

    // ── Tutor ─────────────────────────────────────
    pub fn tutor_message() -> i64 {
        5
    }

    pub fn tutor_correction() -> i64 {
        3
    }
}
