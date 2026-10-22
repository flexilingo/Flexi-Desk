// =============================================================================
// Predicted SRS intervals for the rating buttons.
// =============================================================================
// Ported verbatim from flexi-lingo-front `components/study-shared/_utils/srs-display.ts`
// (itself the review-practice `srs-intervals.ts`). Display-only: the authoritative
// schedule is computed in Rust by `crate::srs::strategy` when the answer is submitted.
// =============================================================================

import type { CardProgressSnapshot, SRSAlgorithm } from '../types';

// Leitner box intervals (days)
const BOX_INTERVALS = [1, 2, 4, 8, 16];

// SM-2 constants
const MIN_EASINESS_FACTOR = 1.3;
const SM2_QUALITY_MAP: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 4, 5: 5 };

// FSRS-4.5 default weights
const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0046, 1.5418, 0.1176, 1.0507, 0.0058,
  0.4662, 0.2098, 0.226, 2.2109, 0.0289, 2.9898,
];

type Progress = CardProgressSnapshot | null | undefined;

function predictLeitner(progress: Progress): Record<number, number> {
  const currentBox = progress?.leitner_box ?? 0;
  const result: Record<number, number> = {};
  for (const rating of [1, 2, 3, 4, 5]) {
    let newBox: number;
    if (rating <= 2) newBox = Math.max(currentBox - 1, 1);
    else if (rating === 3) newBox = currentBox || 1;
    else newBox = Math.min((currentBox || 0) + 1, 5);
    result[rating] = BOX_INTERVALS[newBox - 1] || 1;
  }
  return result;
}

function predictSM2(progress: Progress): Record<number, number> {
  const ef = progress?.easiness_factor ?? 2.5;
  const interval = progress?.sm2_interval ?? 0;
  const reps = progress?.sm2_repetitions ?? 0;
  const result: Record<number, number> = {};

  for (const rating of [1, 2, 3, 4, 5]) {
    const quality = SM2_QUALITY_MAP[rating] ?? 3;
    let newEf = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEf = Math.max(MIN_EASINESS_FACTOR, newEf);

    let newInterval: number;
    if (quality < 3) {
      newInterval = 1;
    } else {
      const newReps = reps + 1;
      if (newReps === 1) newInterval = 1;
      else if (newReps === 2) newInterval = 6;
      else newInterval = Math.round(interval * newEf);
    }
    result[rating] = Math.max(1, newInterval);
  }
  return result;
}

function predictFSRS(progress: Progress): Record<number, number> {
  const stability = progress?.fsrs_stability ?? null;
  const difficulty = progress?.fsrs_difficulty ?? null;
  const state = progress?.fsrs_state || 'new';
  const lastReviewed = progress?.last_reviewed;
  const result: Record<number, number> = {};

  // Map confidence (1-5) to an FSRS rating (1-4).
  const mapRating = (confidence: number): 1 | 2 | 3 | 4 => {
    if (confidence <= 2) return 1;
    if (confidence === 3) return 2;
    if (confidence === 4) return 3;
    return 4;
  };

  let elapsedDays = 0;
  if (lastReviewed) {
    const lastDate = new Date(lastReviewed);
    elapsedDays = Math.max(0, (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  for (const confidence of [1, 2, 3, 4, 5]) {
    const rating = mapRating(confidence);

    if (state === 'new' || stability === null || difficulty === null) {
      // First review
      const initS = Math.max(0.1, W[rating - 1]);
      result[confidence] = rating === 1 ? 1 : Math.max(1, Math.round(initS));
    } else {
      // Subsequent reviews
      const r = Math.pow(1 + elapsedDays / (9 * stability), -1);
      if (rating === 1) {
        result[confidence] = 1;
      } else {
        let modifier = 1;
        if (rating === 2) modifier = W[15];
        if (rating === 4) modifier = W[16];

        const newS =
          stability *
          (1 +
            Math.exp(W[8]) *
              (11 - difficulty) *
              Math.pow(stability, -W[9]) *
              (Math.exp((1 - r) * W[10]) - 1) *
              modifier);
        result[confidence] = Math.max(1, Math.round(newS));
      }
    }
  }
  return result;
}

/** Predict the next review interval (days) for each rating 1–5. */
export function predictIntervals(
  algorithm: SRSAlgorithm | undefined,
  progress: Progress,
): Record<number, number> {
  switch (algorithm) {
    case 'sm2':
      return predictSM2(progress);
    case 'fsrs':
      return predictFSRS(progress);
    case 'leitner':
    default:
      return predictLeitner(progress);
  }
}

/**
 * The labels on the rating buttons. `predicted` is what Rust's own scheduler says
 * each rating does to this card (`predicted_intervals`, 0 = it stays due); the
 * formula port above is only the fallback for a response without it.
 */
export function ratingIntervalLabels(
  predicted: Record<string, number> | null | undefined,
  algorithm: SRSAlgorithm | undefined,
  progress: Progress,
): Record<number, string> {
  const days = predicted ?? predictIntervals(algorithm, progress);
  return Object.fromEntries(
    Object.entries(days).map(([r, d]) => [Number(r), formatInterval(d)]),
  ) as Record<number, string>;
}

/** Format days into a short human string (<1d, 3d, 2w, 5mo, 1.4y). */
export function formatInterval(days: number): string {
  if (days < 1) return '<1d';
  if (days === 1) return '1d';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round((days / 365) * 10) / 10}y`;
}

/** The SRS "card type" chip shown in the progress header. */
export function cardTypeFromProgress(progress: Progress): 'new' | 'learning' | 'review' {
  const state = progress?.fsrs_state;
  if (!progress || !state || state === 'new') return 'new';
  if (state === 'learning' || state === 'relearning') return 'learning';
  return 'review';
}
