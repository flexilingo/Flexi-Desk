import type { VerbDetail } from '@/pages/cheatsheet/lib/types';
import type { CardNotes } from '../types';

/** One mood+tense with its persons, as the study panel draws it. */
export interface ConjGroup {
  mood: string;
  tense: string;
  forms: { pr?: string; form: string; ipa?: string; gloss?: string }[];
}

/** Only Présent shows by default — keeps the panel short; the rest is behind "more tenses". */
export const DEFAULT_TENSES = new Set(['présent']);

/**
 * The tenses the card's own notes carry (the website's `notes.conjugations`), when
 * the deck was made with them. Cloned decks usually do.
 */
export function groupsFromNotes(notes: CardNotes | null | undefined): ConjGroup[] {
  const groups = notes?.conjugations?.groups;
  if (!Array.isArray(groups)) return [];
  return groups
    .map((g) => ({
      mood: g.mood ?? '',
      tense: g.tense ?? '',
      forms: (g.forms ?? []).filter((f) => f && typeof f.form === 'string' && f.form.trim()),
    }))
    .filter((g) => g.forms.length > 0);
}

/** The cheatsheet's verb paradigm, reshaped; each form carries its meaning in the explain language. */
export function groupsFromVerb(verb: VerbDetail): ConjGroup[] {
  return (verb.forms ?? [])
    .map((g) => ({
      mood: g.mood,
      tense: g.tense,
      forms: g.forms.map((f) => ({
        pr: f.pr,
        form: f.form,
        ipa: f.ipa,
        gloss: verb.form_glosses?.[`${g.mood}|${g.tense}|${f.pr}`],
      })),
    }))
    .filter((g) => g.forms.length > 0);
}

/**
 * Whether a card is a French verb the cheatsheet can conjugate: a French deck, and
 * the card says it is a verb (part of speech) — the front is then the infinitive.
 */
export function isFrenchVerbCard(
  notes: CardNotes | null | undefined,
  language: string,
  front: string,
): boolean {
  if (language.toLowerCase().split('-')[0] !== 'fr') return false;
  const pos = (notes?.part_of_speech ?? '').toLowerCase();
  return (
    /\bverb|^v\b|verbe/.test(pos) &&
    front.trim().length > 0 &&
    !/\s/.test(front.trim().replace(/^se |^s'/, ''))
  );
}

/** The infinitive to look up: a reflexive "se laver" is the cheatsheet's `laver`-family entry under its own name. */
export const verbQuery = (front: string): string => front.trim();

/** The tenses shown before "more": Présent, or the first one when the verb has none. */
export function defaultGroups(groups: ConjGroup[]): ConjGroup[] {
  const primary = groups.filter((g) => DEFAULT_TENSES.has(g.tense));
  return primary.length ? primary : groups.slice(0, 1);
}
