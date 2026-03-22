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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_review_card_correct() {
        assert_eq!(XPRules::review_card(true), 10);
    }

    #[test]
    fn test_review_card_incorrect() {
        assert_eq!(XPRules::review_card(false), 3);
    }

    #[test]
    fn test_complete_session_perfect_accuracy() {
        // 10/10 → accuracy=1.0: 20 + 30 = 50
        assert_eq!(XPRules::complete_session(10, 10), 50);
    }

    #[test]
    fn test_complete_session_zero_cards() {
        // 0 total → accuracy=0.0: 20 + 0 = 20
        assert_eq!(XPRules::complete_session(0, 0), 20);
    }

    #[test]
    fn test_complete_session_partial_accuracy() {
        // 8/10 → accuracy=0.8: 20 + 24 = 44
        assert_eq!(XPRules::complete_session(10, 8), 44);
    }

    #[test]
    fn test_reading_words_per_hundred() {
        // 500 words → 5 * 5 = 25
        assert_eq!(XPRules::reading_words(500), 25);
    }

    #[test]
    fn test_reading_words_below_hundred_returns_zero() {
        // 50 words → (50/100)*5 = 0
        assert_eq!(XPRules::reading_words(50), 0);
    }

    #[test]
    fn test_reading_highlight() {
        assert_eq!(XPRules::reading_highlight(), 2);
    }

    #[test]
    fn test_writing_submit_base_xp() {
        assert_eq!(XPRules::writing_submit(0), 25);
    }

    #[test]
    fn test_writing_submit_with_words() {
        // 100 words → 25 + (100/50)*5 = 35
        assert_eq!(XPRules::writing_submit(100), 35);
    }

    #[test]
    fn test_pronunciation_attempt_perfect_score() {
        // score=1.0: 5 + 15 = 20
        assert_eq!(XPRules::pronunciation_attempt(1.0), 20);
    }

    #[test]
    fn test_pronunciation_attempt_zero_score() {
        // score=0.0: 5 + 0 = 5
        assert_eq!(XPRules::pronunciation_attempt(0.0), 5);
    }

    #[test]
    fn test_caption_session_short_duration() {
        // 120s = 2 min → 2 * 3 = 6
        assert_eq!(XPRules::caption_session(120), 6);
    }

    #[test]
    fn test_caption_session_capped_at_60() {
        // 2000s = 33 min → 99, capped at 60
        assert_eq!(XPRules::caption_session(2000), 60);
    }

    #[test]
    fn test_podcast_listen_short_duration() {
        // 60s = 1 min → 1 * 2 = 2
        assert_eq!(XPRules::podcast_listen(60), 2);
    }

    #[test]
    fn test_podcast_listen_capped_at_40() {
        // 2000s = 33 min → 66, capped at 40
        assert_eq!(XPRules::podcast_listen(2000), 40);
    }

    #[test]
    fn test_exam_complete_perfect_score() {
        // score=1.0, total=20: 30 + 50 + (20/10)*5 = 90
        assert_eq!(XPRules::exam_complete(1.0, 20), 90);
    }

    #[test]
    fn test_exam_complete_zero_score() {
        // score=0.0, total=10: 30 + 0 + (10/10)*5 = 35
        assert_eq!(XPRules::exam_complete(0.0, 10), 35);
    }

    #[test]
    fn test_tutor_message() {
        assert_eq!(XPRules::tutor_message(), 5);
    }

    #[test]
    fn test_tutor_correction() {
        assert_eq!(XPRules::tutor_correction(), 3);
    }
}
