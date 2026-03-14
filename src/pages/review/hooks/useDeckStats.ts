import type { DeckWithStats } from '../types';

export function useDeckStats(deck: DeckWithStats) {
  const masteryPercent =
    deck.cardCount > 0
      ? Math.round(((deck.cardCount - deck.newCards - deck.dueToday) / deck.cardCount) * 100)
      : 0;

  return {
    masteryPercent: Math.max(0, masteryPercent),
    hasDueCards: deck.dueToday > 0,
    isEmpty: deck.cardCount === 0,
  };
}
