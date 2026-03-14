import type { Rating } from '../types';
import type { CardProgress, PreviewResult, SRSStrategy } from './types';

const INTERVALS = [1, 3, 7, 14, 30];

export class LeitnerStrategy implements SRSStrategy {
  schedule(card: CardProgress, rating: Rating): PreviewResult {
    const currentBox = card.boxNumber ?? 0;

    let newBox: number;
    switch (rating) {
      case 'again':
        newBox = 1;
        break;
      case 'hard':
        newBox = Math.max(currentBox, 1);
        break;
      case 'good':
        newBox = Math.min(currentBox + 1, 5);
        break;
      case 'easy':
        newBox = Math.min(currentBox + 2, 5);
        break;
    }

    return {
      intervalDays: INTERVALS[newBox - 1],
      state: newBox === 1 ? 'learning' : 'review',
    };
  }

  algorithmName(): string {
    return 'leitner';
  }
}
