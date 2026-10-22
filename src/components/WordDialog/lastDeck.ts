import { useMemo, useSyncExternalStore } from 'react';

/**
 * The deck (and add mode) a reader last saved a word into. Remembering it lets
 * the word dialog save in one tap and puts that deck first in the full sheet.
 */
export type AddMode = 'basic' | 'smart';
export interface LastDeck {
  deckId: string;
  mode: AddMode;
}

const KEY = 'flexi.deck.lastUsed';
const CHANGED = 'flexi:last-deck';

export function parseLastDeck(raw: string | null): LastDeck | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LastDeck>;
    if (typeof value.deckId !== 'string' || !value.deckId) return null;
    return { deckId: value.deckId, mode: value.mode === 'smart' ? 'smart' : 'basic' };
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const readLastDeck = (): LastDeck | null => parseLastDeck(readRaw());

export function rememberDeck(value: LastDeck): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The remembered deck, kept current when any dialog saves into a new one. */
export function useLastDeck(): LastDeck | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parseLastDeck(raw), [raw]);
}
