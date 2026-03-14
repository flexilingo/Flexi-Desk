import type { Rating } from '../types';
import type { CardProgress, PreviewResult, SRSStrategy } from './types';

const QUALITY_MAP: Record<Rating, number> = {
  again: 1,
  hard: 2,
  good: 4,
  easy: 5,
};

export class SM2Strategy implements SRSStrategy {
  schedule(card: CardProgress, rating: Rating): PreviewResult {
    const q = QUALITY_MAP[rating];
    const oldEF = card.easinessFactor ?? 2.5;
    const oldReps = card.repetitions ?? 0;
    const oldInterval = card.intervalDays;

    const efDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
    const newEF = Math.max(oldEF + efDelta, 1.3);

    if (q < 3) {
      return { intervalDays: 1, state: 'relearning' };
    }

    let interval: number;
    if (oldReps === 0) interval = 1;
    else if (oldReps === 1) interval = 6;
    else interval = Math.round(oldInterval * newEF);

    return { intervalDays: interval, state: 'review' };
  }

  algorithmName(): string {
    return 'sm2';
  }
}
