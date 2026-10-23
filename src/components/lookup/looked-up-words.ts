import { supabaseCall } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { cleanWord } from './tokenize';

/**
 * The words the learner has looked up, per language — so a word looked up once stays marked
 * (the dotted olive underline) on every page they read afterwards, not only until the page turns.
 *
 * Signed in, the list is the account's (core `vocabulary?action=looked-up-words`, fetched once
 * per language per session). The desk also keeps its own list on this machine for everyone —
 * the only list when signed out, and for a signed-in reader the desk's lookups the server has
 * not heard about. A word looked up now is added at once, wherever it was looked up.
 *
 * Words are matched exactly on their looked-up form: the page's word, cleaned of joiners at its
 * edges, lowercased.
 */

/** Words kept on this machine, per language, newest first. */
export const LOCAL_CAP = 2000;
const LOCAL_KEY = 'flexi.lookedUp.v1';

/** A word in the form it is kept and matched in. */
export const lookedUpForm = (word: string): string => cleanWord(word.trim()).toLowerCase();

/** A language code as the lists are kept by: `en-US` → `en`. */
export const languageKey = (language: string): string =>
  language.trim().toLowerCase().replace('_', '-').split('-')[0];

/** Puts a word first in a newest-first list, once, and keeps the list to the cap. */
export function pushRecent(list: string[], word: string, cap = LOCAL_CAP): string[] {
  return [word, ...list.filter((w) => w !== word)].slice(0, cap);
}

type Local = Record<string, string[]>;

function readLocal(): Local {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? '{}') as Local;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocal(all: Local): void {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  } catch {
    /* kept for this session only */
  }
}

/** The local list of a language, newest first. */
export const localLookedUp = (language: string): string[] =>
  readLocal()[languageKey(language)] ?? [];

const sets = new Map<string, Set<string>>();
/** Languages whose account list was asked for in this session (whatever the answer). */
const fetched = new Set<string>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

function setOf(lang: string): Set<string> {
  let set = sets.get(lang);
  if (!set) {
    set = new Set(localLookedUp(lang));
    sets.set(lang, set);
  }
  return set;
}

/** Whether this word (as the page shows it) was looked up in this language. */
export function isLookedUp(language: string, word: string): boolean {
  const form = lookedUpForm(word);
  return !!form && setOf(languageKey(language)).has(form);
}

/** Called whenever a language's list grows (a lookup, the account's list arriving). */
export function subscribeLookedUp(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Makes sure a language's list is here: this machine's at once, and — signed in — the account's,
 * asked for once per session.
 */
export function loadLookedUp(language: string): void {
  const lang = languageKey(language);
  if (!lang) return;
  setOf(lang);
  if (fetched.has(lang) || !useAuthStore.getState().session) return;
  fetched.add(lang);
  supabaseCall<{ language: string; words: string[]; truncated: boolean }>(
    'GET',
    `/vocabulary?action=looked-up-words&language=${encodeURIComponent(lang)}`,
  )
    .then((answer) => {
      const set = setOf(lang);
      const before = set.size;
      for (const word of answer?.words ?? []) {
        const form = lookedUpForm(word);
        if (form) set.add(form);
      }
      if (set.size !== before) notify();
    })
    .catch(() => {
      // Asked again next session; this machine's list still marks what it knows.
    });
}

/** A word just looked up: marked at once everywhere, and kept on this machine. */
export function addLookedUp(language: string, word: string): void {
  const lang = languageKey(language);
  const form = lookedUpForm(word);
  // A phrase is not a word on the page.
  if (!lang || !form || /\s/.test(form)) return;
  const all = readLocal();
  all[lang] = pushRecent(all[lang] ?? [], form);
  writeLocal(all);
  const set = setOf(lang);
  if (set.has(form)) return;
  set.add(form);
  notify();
}

/** Signing in or out changes whose list it is: forget what was loaded. */
export function resetLookedUp(): void {
  sets.clear();
  fetched.clear();
  notify();
}

useAuthStore.subscribe((state, previous) => {
  if (!!state.session !== !!previous.session) resetLookedUp();
});
