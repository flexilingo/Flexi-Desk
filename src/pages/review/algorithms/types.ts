import type { CardState, Rating } from '../types';

export interface CardProgress {
  cardId: string;
  boxNumber?: number;
  easinessFactor?: number;
  repetitions?: number;
  stability?: number;
  difficulty?: number;
  state: CardState;
  intervalDays: number;
}

export interface PreviewResult {
  intervalDays: number;
  state: CardState;
}

export interface SRSStrategy {
  schedule(card: CardProgress, rating: Rating): PreviewResult;
  algorithmName(): string;
}
