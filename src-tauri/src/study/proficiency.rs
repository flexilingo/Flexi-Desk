// =============================================================================
// Study engine — proficiency updater (ported from proficiency-updater.ts)
// =============================================================================
// Pure logic. Caller wraps with persistence.
// =============================================================================

use super::types::*;

// Learning rate per dimension. Higher = scores move faster after an activity.
const LR_PRIMARY: f64 = 0.20; // dimension the activity directly tests
const LR_SECONDARY: f64 = 0.07; // dimensions the activity also touches lightly

pub struct ApplyResultInput<'a> {
    pub proficiency: &'a CardProficiency,
    pub activity_type: ActivityType,
    pub is_correct: bool,
    /// 0.0–1.0 — partial credit (AI grading, ASR confidence, etc.)
    pub score: f64,
    pub response_time_ms: Option<i64>,
}

pub struct ApplyResultOutput {
    pub next: CardProficiency,
    pub affected_dimensions: Vec<ProficiencyDimension>,
}

/// Time penalty: very slow correct answers earn less.
fn time_penalty(ms: Option<i64>) -> f64 {
    match ms {
        None => 1.0,
        Some(ms) if ms <= 3000 => 1.0,
        Some(ms) if ms <= 6000 => 0.95,
        Some(ms) if ms <= 10000 => 0.85,
        Some(_) => 0.7,
    }
}

fn clamp01(v: f64) -> f64 {
    if v.is_nan() {
        0.0
    } else if v < 0.0 {
        0.0
    } else if v > 1.0 {
        1.0
    } else {
        v
    }
}

fn blend(prev: f64, target: f64, lr: f64) -> f64 {
    clamp01(prev + (target - prev) * lr)
}

pub fn apply_result(input: ApplyResultInput, now: &str) -> ApplyResultOutput {
    let primary = input.activity_type.dimension();
    let secondaries = input.activity_type.secondary_dimensions();
    let mut all: Vec<ProficiencyDimension> = vec![primary];
    all.extend(secondaries.iter().copied());

    let eff = if input.is_correct {
        clamp01(input.score) * time_penalty(input.response_time_ms)
    } else {
        0.0
    };

    let mut next = input.proficiency.clone();

    // Primary dimension.
    next.set_score(primary, blend(input.proficiency.score_for(primary), eff, LR_PRIMARY));

    // Secondaries (small drift).
    for d in &secondaries {
        next.set_score(*d, blend(input.proficiency.score_for(*d), eff, LR_SECONDARY));
    }

    next.total_attempts = input.proficiency.total_attempts + 1;
    next.consecutive_failures = if input.is_correct {
        0
    } else {
        input.proficiency.consecutive_failures + 1
    };
    next.last_practiced_at = Some(now.to_string());
    next.learning_stage = compute_stage(&next);

    ApplyResultOutput {
        next,
        affected_dimensions: all,
    }
}

/// Recompute learning_stage (ported from computeStage).
pub fn compute_stage(p: &CardProficiency) -> LearningStage {
    if p.consecutive_failures >= 3 {
        return LearningStage::Leech;
    }
    let avg = p.avg();
    if p.total_attempts == 0 {
        LearningStage::New
    } else if p.total_attempts < 3 {
        LearningStage::Learning
    } else if avg < 0.40 {
        LearningStage::Learning
    } else if avg < 0.65 {
        LearningStage::Reinforcing
    } else if avg < 0.85 {
        LearningStage::Solidifying
    } else {
        LearningStage::Mature
    }
}

/// Map a self_rating (1..5) → (is_correct, score) for the `recall` activity.
pub fn self_rating_to_evidence(rating: u8) -> (bool, f64) {
    match rating {
        1 => (false, 0.0),
        2 => (true, 0.45),
        3 => (true, 0.70),
        4 => (true, 0.88),
        5 => (true, 1.0),
        _ => (false, 0.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correct_answer_raises_primary_dimension() {
        let p = CardProficiency::new("c1", "d1");
        let out = apply_result(
            ApplyResultInput {
                proficiency: &p,
                activity_type: ActivityType::TypeTest, // primary = recall
                is_correct: true,
                score: 1.0,
                response_time_ms: Some(1000),
            },
            "2026-07-08T00:00:00Z",
        );
        assert!(out.next.recall_score > 0.0);
        assert_eq!(out.next.total_attempts, 1);
        assert_eq!(out.next.consecutive_failures, 0);
    }

    #[test]
    fn three_failures_makes_leech() {
        let mut p = CardProficiency::new("c1", "d1");
        p.consecutive_failures = 2;
        let out = apply_result(
            ApplyResultInput {
                proficiency: &p,
                activity_type: ActivityType::Recall,
                is_correct: false,
                score: 0.0,
                response_time_ms: None,
            },
            "2026-07-08T00:00:00Z",
        );
        assert_eq!(out.next.consecutive_failures, 3);
        assert_eq!(out.next.learning_stage, LearningStage::Leech);
    }

    #[test]
    fn self_rating_maps_evidence() {
        assert_eq!(self_rating_to_evidence(1), (false, 0.0));
        assert_eq!(self_rating_to_evidence(5), (true, 1.0));
        assert!(self_rating_to_evidence(3).0);
    }
}
