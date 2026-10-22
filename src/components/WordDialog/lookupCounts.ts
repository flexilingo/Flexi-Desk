/**
 * How many times this machine has looked a word up, per language. Desk keeps no
 * Leitner boxes (it schedules with FSRS), so the one history fact the header can
 * show is "seen N times". Kept in localStorage; capped so it cannot grow without bound.
 */
const KEY = 'flexi.wordDialog.seen';
const MAX_ENTRIES = 5000;

const keyOf = (lang: string, word: string) => `${lang}:${word.trim().toLowerCase()}`;

function read(): Record<string, number> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Counts this lookup and returns how many times the word has now been looked up. */
export function bumpSeen(lang: string, word: string): number {
  const all = read();
  const key = keyOf(lang, word);
  all[key] = (all[key] ?? 0) + 1;
  const keys = Object.keys(all);
  if (keys.length > MAX_ENTRIES)
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete all[k];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* counted for this session only */
  }
  return all[key];
}
