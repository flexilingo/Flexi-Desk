import type { Rating } from '../types';
import type { CardProgress, PreviewResult, SRSStrategy } from './types';

const FACTOR = 19 / 81;
const DECAY = -0.5;
const INITIAL_STABILITY = [0.4, 0.6, 2.4, 5.8];
const INITIAL_DIFFICULTY = 4.93;
const DIFFICULTY_DECAY = 0.12;
const STABILITY_DECAY = 0.21;
const RETRIEVABILITY_GAIN = 2.0;
export class FSRSStrategy implements SRSStrategy {
  private desiredRetention = 0.9;

  private retrievability(elapsedDays: number, stability: number): number {
    if (stability <= 0) return 0;
    return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
  }

  private nextInterval(stability: number): number {
    const interval = (stability / FACTOR) * (Math.pow(this.desiredRetention, 1 / DECAY) - 1);
    return Math.max(1, Math.round(interval));
  }

  schedule(card: CardProgress, rating: Rating): PreviewResult {
    const ratingIdx = { again: 0, hard: 1, good: 2, easy: 3 }[rating];
    let newStability: number;
    let state: PreviewResult['state'];

    if (card.state === 'new') {
      newStability = INITIAL_STABILITY[ratingIdx];
      state = rating === 'again' ? 'learning' : 'review';
    } else if (card.state === 'learning' || card.state === 'relearning') {
      newStability = (card.stability ?? 0.4) * 1.5;
      state = rating === 'again' ? 'relearning' : 'review';
    } else {
      const s = card.stability ?? 1.0;
      const d = card.difficulty ?? INITIAL_DIFFICULTY;
      const elapsed = card.intervalDays;
      const r = this.retrievability(elapsed, s);

      if (rating === 'again') {
        newStability = Math.max(0.1, s * Math.exp(-0.5 * d) * (Math.pow(r + 1, 0.2) - 1) * 0.5);
        state = 'relearning';
      } else {
        const bonus = { hard: 0.8, good: 1.0, easy: 1.3 }[rating] ?? 1.0;
        newStability =
          s *
          (1 +
            Math.exp(DIFFICULTY_DECAY) *
              (11 - d) *
              Math.pow(s, -STABILITY_DECAY) *
              (Math.exp((1 - r) * RETRIEVABILITY_GAIN) - 1)) *
          bonus;
        state = 'review';
      }
    }

    return {
      intervalDays: this.nextInterval(newStability),
      state,
    };
  }

  algorithmName(): string {
    return 'fsrs';
  }
}
