// =============================================================================
// Study engine — constants (ported from practice-session/constants.ts)
// =============================================================================

/// Minimum activity score to trigger a full SRS schedule update.
/// Below this only view/last-reviewed bookkeeping happens.
pub const SRS_WRITE_THRESHOLD: f64 = 0.70;

/// Maps a normalised activity score [0,1] → confidence rating [1,5]:
///   0.00–0.30 → 1 (Again)
///   0.30–0.50 → 2 (Hard)
///   0.50–0.70 → 3 (Okay)
///   0.70–0.90 → 4 (Good)
///   0.90–1.00 → 5 (Easy)
pub fn score_to_confidence(score: f64) -> u8 {
    if score < 0.30 {
        1
    } else if score < 0.50 {
        2
    } else if score < 0.70 {
        3
    } else if score < 0.90 {
        4
    } else {
        5
    }
}
