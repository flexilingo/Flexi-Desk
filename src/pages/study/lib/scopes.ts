import type { DeckStatus, StudyScope } from '../types';

/** The scopes the sheet offers (leech has its own quick-start chip on the hero). */
export const SCOPES: StudyScope[] = ['due', 'new', 'weak', 'random'];

export interface ScopeMeta {
  count: number | null;
  available: boolean;
}

/**
 * Which scopes have cards, from the picked deck's status. All-decks ("today's mix") can't be sized, so
 * everything is available and no count is shown. "Review even if not due" pulls the cards scheduled for later
 * into the due scope, so with it ticked "Due" is available whenever the deck has cards that were already studied.
 */
export function scopeAvailability(
  deck: DeckStatus | null,
  force: boolean,
): Record<StudyScope, ScopeMeta> {
  if (!deck) {
    return {
      due: { count: null, available: true },
      new: { count: null, available: true },
      weak: { count: null, available: true },
      random: { count: null, available: true },
      leech: { count: null, available: true },
    };
  }
  const seen = Math.max(0, deck.total_cards - deck.untouched_count);
  const forcedDue = force && seen > 0;
  return {
    // Due also counts the never-seen cards the plan brings in alongside.
    due: {
      count: forcedDue ? seen : deck.due_count,
      available: deck.due_count > 0 || deck.untouched_count > 0 || forcedDue,
    },
    new: { count: deck.untouched_count, available: deck.untouched_count > 0 },
    weak: { count: null, available: seen > 0 },
    // 'random' draws from ALL cards, ignoring the schedule.
    random: { count: deck.total_cards, available: deck.total_cards > 0 },
    leech: { count: deck.leech_count, available: deck.leech_count > 0 },
  };
}

/** The scope a sheet opens on: the first one with cards, judged as if the box were clear (reopening clears it). */
export function defaultScope(deck: DeckStatus | null): StudyScope {
  const meta = scopeAvailability(deck, false);
  return SCOPES.find((s) => meta[s].available) ?? 'due';
}
