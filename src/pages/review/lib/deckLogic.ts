// Pure rules behind the Decks and Explore screens. No React, no IPC: everything here is
// ported from the website's decks pages so both apps decide the same way, and each rule is
// unit-tested in tests/decks-*.test.ts.

import type { CardNotes, DeckWithStats } from '../types';

// ── Language pair ──────────────────────────────────────────

/** "fr-fa" → { learning: "fr", native: "fa" }, with fallbacks for a missing half. */
export function splitLanguagePair(
  pair: string | null | undefined,
  fallback: { learning: string; native: string },
): { learning: string; native: string } {
  const [l, n] = (pair || '').split('-').map((s) => s.trim().toLowerCase());
  return { learning: l || fallback.learning, native: n || fallback.native };
}

/** The language a deck's cards are written in: the left half of its pair. */
export function deckSourceLang(pair: string | null | undefined): string {
  return (pair || '').split('-')[0].trim().toLowerCase() || 'en';
}

/** A deck's meanings language: the right half of a website pair. */
export function deckMeaningLang(pair: string | null | undefined): string | undefined {
  return (pair || '').split('-')[1]?.trim().toLowerCase() || undefined;
}

/** A translated copy is titled "<original> [VI]"; anyone but the owner sees it without the tag. */
export function publicDeckTitle(title: string | null | undefined): string {
  return (title || '').replace(/\s*\[[A-Za-z]{2,3}\]\s*$/, '');
}

/** A deck with fewer cards than this is a leftover, not something to browse. */
export const MIN_LISTED_CARDS = 5;

// ── Deck list ──────────────────────────────────────────────

export type DeckVisibilityFilter = 'all' | 'public' | 'private';
export type DeckSort = 'recent' | 'alpha' | 'cards' | 'due';

export function filterAndSortDecks(
  decks: DeckWithStats[],
  opts: { filter: DeckVisibilityFilter; search: string; sort: DeckSort },
): DeckWithStats[] {
  let result = [...decks];
  if (opts.filter === 'public') result = result.filter((d) => d.isPublic);
  if (opts.filter === 'private') result = result.filter((d) => !d.isPublic);
  const q = opts.search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  const time = (d: DeckWithStats) => new Date(d.createdAt.replace(' ', 'T')).getTime() || 0;
  if (opts.sort === 'alpha') result.sort((a, b) => a.name.localeCompare(b.name));
  else if (opts.sort === 'cards') result.sort((a, b) => b.cardCount - a.cardCount);
  else if (opts.sort === 'due') result.sort((a, b) => b.dueToday - a.dueToday);
  else result.sort((a, b) => time(b) - time(a));
  return result;
}

export type DeckStatus = 'review' | 'good' | 'untouched';

/** Card health: cards due now, some mastery, or never practised. Drives the card's colour. */
export function deckStatus(deck: Pick<DeckWithStats, 'dueToday' | 'mastered'>): DeckStatus {
  return deck.dueToday > 0 ? 'review' : deck.mastered > 0 ? 'good' : 'untouched';
}

export function masteryPercent(deck: Pick<DeckWithStats, 'mastered' | 'cardCount'>): number {
  return deck.cardCount > 0 ? Math.min(100, Math.round((deck.mastered / deck.cardCount) * 100)) : 0;
}

/** The streak line under the streak number. */
export function streakHint(
  current: number,
  longest: number,
): { kind: 'toBest' | 'best' | 'start'; days: number } {
  if (longest > current) return { kind: 'toBest', days: longest - current };
  return current > 0 ? { kind: 'best', days: 0 } : { kind: 'start', days: 0 };
}

// ── Typed delete ───────────────────────────────────────────

/** The English word always works; so does the word in the learner's own language. */
export function isDeleteConfirmed(input: string, localizedWord: string): boolean {
  const typed = input.trim().toLowerCase();
  return typed !== '' && (typed === 'delete' || typed === localizedWord.trim().toLowerCase());
}

// ── Cards ──────────────────────────────────────────────────

export function parseCardNotes(notes: string | null | undefined): CardNotes | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as CardNotes & Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    // Where a card's content came from is the owner's business and never shown on a card.
    delete parsed.source_context;
    delete parsed.video_url;
    delete parsed.video_id;
    return parsed;
  } catch {
    return null;
  }
}

/** Cards made by the AI carry a marker in their notes (older ones use the legacy `mode`). */
export function isAIGeneratedCard(notes: CardNotes | null): boolean {
  if (!notes) return false;
  return (
    notes.generated_by === 'ai' ||
    notes.generated_by === 'word_content' ||
    notes.generated_by === 'smart_ai' ||
    notes.generated_by === 'basic_ai' ||
    notes.mode === 'smart'
  );
}

export interface CardExample {
  source: string;
  target: string;
}

export function cardExamples(notes: CardNotes | null): CardExample[] {
  return (notes?.examples ?? [])
    .map((e) => ({ source: e.source ?? e.en ?? '', target: e.target ?? e.tr ?? '' }))
    .filter((e) => e.source || e.target);
}

/**
 * The notes JSON to save after the card dialog: the existing JSON keeps every key it had
 * (IPA, definition, …) and only `examples` follows the dialog; a card with no JSON gets
 * one only when it has examples. Never loses AI-written fields.
 */
export function buildNotesForSave(
  existing: string | null | undefined,
  examples: CardExample[],
): string {
  const kept = examples
    .map((e) => ({ source: e.source.trim(), target: e.target.trim() }))
    .filter((e) => e.source || e.target);
  const parsed = parseRawNotes(existing);
  if (parsed) {
    if (kept.length > 0) parsed.examples = kept;
    else delete parsed.examples;
    return Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : '';
  }
  if (kept.length > 0) return JSON.stringify({ examples: kept });
  // A note that is not JSON (an older plain-text note) is kept as it was.
  return existing ?? '';
}

/** Raw notes object including owner-only keys — only for re-saving, never for display. */
function parseRawNotes(notes: string | null | undefined): Record<string, unknown> | null {
  if (!notes) return null;
  try {
    const v = JSON.parse(notes);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function hasRtlText(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

// ── Hiding the meaning of someone else's deck ──────────────

const SCRIPTS: [string, RegExp][] = [
  ['arabic', /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/],
  ['hebrew', /[\u0590-\u05FF]/],
  ['cyrillic', /[\u0400-\u04FF]/],
  ['greek', /[\u0370-\u03FF]/],
  ['devanagari', /[\u0900-\u097F]/],
  ['thai', /[\u0E00-\u0E7F]/],
  ['cjk', /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/],
];
const scriptsIn = (text: string) =>
  new Set(SCRIPTS.filter(([, re]) => re.test(text)).map(([s]) => s));

/** Note fields written in the deck's meaning language, whatever the words are in. */
const MEANING_FIELDS = [
  'translation',
  'definition',
  'memory_hook',
  'common_mistakes',
  'cultural_note',
  'pronunciation_tips',
  'etymology',
] as const;

/**
 * A card's notes with everything in the deck's meaning language removed. Used when a
 * public deck is shown to someone who does not read its meaning language: the meaning
 * fields go by name, then any text in a script other than the card's own front goes too,
 * so a field added later cannot leak the language. Examples keep their source side only.
 */
export function withoutMeaningLanguage(notes: CardNotes, frontText: string): CardNotes {
  const allowed = scriptsIn(frontText);
  const foreign = (s: string) => [...scriptsIn(s)].some((x) => !allowed.has(x));
  const clean = (value: unknown): unknown => {
    if (typeof value === 'string') return foreign(value) ? undefined : value;
    if (Array.isArray(value)) return value.map(clean).filter((v) => v !== undefined);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const c = clean(v);
        if (c !== undefined) out[k] = c;
      }
      return out;
    }
    return value;
  };
  const copy: Record<string, unknown> = { ...notes };
  for (const field of MEANING_FIELDS) delete copy[field];
  const cleaned = clean(copy) as CardNotes;
  if (notes.examples) {
    cleaned.examples = notes.examples
      .map((ex) => ({ source: ex.source, en: ex.en }))
      .filter((ex) => (ex.source || ex.en) && !foreign(`${ex.source ?? ''}${ex.en ?? ''}`));
  }
  return cleaned;
}

// ── Explore ────────────────────────────────────────────────

export interface PublicDeckSummary {
  id: string;
  title: string;
  description: string | null;
  card_count: number;
  language_pair: string | null;
  user_id?: string;
  created_at: string;
  total_clones?: number | null;
  source_url?: string | null;
  source_type?: string | null;
  source_public?: boolean | null;
  cover_url?: string | null;
  tags?: string[] | null;
  official?: boolean;
}

export type ExploreSort = 'recent' | 'popular';
export type ExploreSource = '' | 'official' | 'users';

export interface ExploreFilters {
  query: string;
  source: ExploreSource;
  language: string;
  sort: ExploreSort;
}

const cardsLangOf = (d: PublicDeckSummary) => deckSourceLang(d.language_pair);
const matchesQuery = (d: PublicDeckSummary, query: string) => {
  const q = query.trim().toLowerCase();
  return (
    !q || d.title?.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q)
  );
};

/** Decks too small to browse never reach the list (they stay reachable by link). */
export function listableDecks(decks: PublicDeckSummary[]): PublicDeckSummary[] {
  return decks.filter((d) => (d.card_count ?? 0) >= MIN_LISTED_CARDS);
}

/**
 * Faceted counts, as the website's bar does: each control counts under the OTHER filters,
 * so a language you could still pick never shows 0 just because another is selected.
 */
export function exploreFacets(
  decks: PublicDeckSummary[],
  f: Pick<ExploreFilters, 'query' | 'source' | 'language'>,
): { sources: Record<ExploreSource, number>; languages: [string, number][] } {
  const base = decks.filter((d) => matchesQuery(d, f.query));
  const pool = base.filter((d) => !f.language || cardsLangOf(d) === f.language);
  const sources: Record<ExploreSource, number> = {
    '': pool.length,
    official: pool.filter((d) => !!d.official).length,
    users: pool.filter((d) => !d.official).length,
  };
  const counts = new Map<string, number>();
  for (const d of decks) counts.set(cardsLangOf(d), counts.get(cardsLangOf(d)) ?? 0);
  for (const d of base) {
    if (f.source && (f.source === 'official') !== !!d.official) continue;
    counts.set(cardsLangOf(d), (counts.get(cardsLangOf(d)) ?? 0) + 1);
  }
  const languages = [...counts.entries()]
    .filter(([code, n]) => n > 0 || code === f.language)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { sources, languages };
}

export function filterPublicDecks(
  decks: PublicDeckSummary[],
  f: ExploreFilters,
): PublicDeckSummary[] {
  const list = decks.filter(
    (d) =>
      matchesQuery(d, f.query) &&
      (!f.source || (f.source === 'official') === !!d.official) &&
      (!f.language || cardsLangOf(d) === f.language),
  );
  // The API returns newest first. Popular = most saved, recency breaking ties.
  if (f.sort !== 'popular') return list;
  const time = (d: PublicDeckSummary) => new Date(d.created_at).getTime() || 0;
  return [...list].sort(
    (a, b) => (b.total_clones ?? 0) - (a.total_clones ?? 0) || time(b) - time(a),
  );
}

// ── Saving a public deck ───────────────────────────────────

export type CloneMode = 'copy' | 'translate';

/** The deck's own meaning language needs no translation: that is an instant copy. */
export function decideCloneMode(deckMeaningLanguage: string, chosenLanguage: string): CloneMode {
  return chosenLanguage === deckMeaningLanguage ? 'copy' : 'translate';
}

export interface LibraryCopy {
  id: string;
  language: string;
  nativeLanguage?: string;
  createdAt: string;
}

/** Copies of a public deck the learner already holds, newest first. */
export function copiesOf(
  decks: DeckWithStats[],
  originalDeckId: string | null | undefined,
): LibraryCopy[] {
  if (!originalDeckId) return [];
  return decks
    .filter((d) => d.originalDeckId === originalDeckId)
    .map((d) => ({
      id: d.id,
      language: d.language,
      nativeLanguage: d.nativeLanguage,
      createdAt: d.createdAt,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Meaning languages the learner already holds this deck in. */
export function ownedMeaningLanguages(copies: LibraryCopy[], cardsLanguage: string): Set<string> {
  return new Set(
    copies
      .filter((c) => c.language === cardsLanguage && c.nativeLanguage)
      .map((c) => c.nativeLanguage as string),
  );
}

/** A translated copy is titled "<original> [VI]"; an exact copy keeps the original title. */
export function cloneTitle(title: string, mode: CloneMode, nativeLanguage: string): string {
  const base = publicDeckTitle(title);
  return mode === 'translate' ? `${base} [${nativeLanguage.toUpperCase()}]` : base;
}

/** Cards of a public deck in the author's order (the API lists newest first). */
export function inAuthorOrder<T extends { order_index?: number | null }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

/** The YouTube id inside a source URL, if the deck was made from a video. */
export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

// ── Publish / Share ────────────────────────────────────────

export type ShareAvailability = 'sign-in' | 'empty' | 'needs-publish' | 'ready';

/**
 * What the Publish / Share dialog can do right now. A link points at the website's copy of
 * the deck, so the deck has to be pushed there first; nothing can be pushed without an
 * account or without cards.
 */
export function shareAvailability(d: {
  signedIn: boolean;
  cardCount: number;
  cloudDeckId?: string | null;
}): ShareAvailability {
  if (!d.signedIn) return 'sign-in';
  if (d.cardCount === 0) return 'empty';
  return d.cloudDeckId ? 'ready' : 'needs-publish';
}

/** Expiry choices offered for a share link (days; null = never). */
export const SHARE_EXPIRY_DAYS: (number | null)[] = [null, 1, 7, 30];
