import type { Algorithm } from '../types';
import type { SRSStrategy } from './types';
import { LeitnerStrategy } from './leitner';
import { SM2Strategy } from './sm2';
import { FSRSStrategy } from './fsrs';

export function createStrategy(algorithm: Algorithm): SRSStrategy {
  switch (algorithm) {
    case 'leitner':
      return new LeitnerStrategy();
    case 'sm2':
      return new SM2Strategy();
    case 'fsrs':
      return new FSRSStrategy();
  }
}

export type { SRSStrategy, CardProgress, PreviewResult } from './types';
