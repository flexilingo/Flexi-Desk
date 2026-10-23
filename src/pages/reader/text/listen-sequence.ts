import { paragraphChunks } from '@/components/lookup/ParagraphSpeakButton';
import { splitParagraphs, splitSentences } from '@/components/lookup/tokenize';
import type { SpeakOutcome } from '@/lib/speech';

/**
 * The «Listen» player's order of reading, as pure functions: a page is read sentence by
 * sentence, the sentences exactly as the page shows them (paragraphs, then sentences — the
 * split `TappableText` uses), a sentence too long for the voice in the paragraph speaker's
 * pieces. At the end of a page the player turns to the next one — or stops, and says why.
 *
 * Who may go on past a page: the page on screen is read for everyone; turning to the next
 * page by itself — or with Next on a page's last sentence — is Pro. A signed-out reader is
 * first asked to sign in, a signed-in reader without Pro is offered Pro.
 */

/** One sentence of a page, where the page shows it. */
export interface PageSentence {
  paragraph: number;
  /** Its place within the paragraph. */
  sentence: number;
  text: string;
  /** What the voice is given, in order: the sentence itself, or its pieces when it is very long. */
  pieces: string[];
}

/** What the page-end rule needs to know about the reader and the book. */
export interface ListenFacts {
  /** There is a page after this one. */
  hasNext: boolean;
  /** There is a page before this one. */
  hasPrev: boolean;
  signedIn: boolean;
  /** A paid plan (Pro, Lifetime, a trial): reading on page after page. */
  pro: boolean;
}

export type ListenStop =
  /** The last page was read: the next-episode button is there. */
  | 'end'
  /** Going on needs an account first. */
  | 'signIn'
  /** Going on needs Pro. */
  | 'pro'
  /** Something else spoke (a word), or stop was pressed elsewhere. */
  | 'interrupted'
  /** No voice could say it. */
  | 'silent';

export type ListenMove =
  /** Say this sentence of the page. */
  | { kind: 'speak'; index: number }
  /** Turn to the next page and read it from its first sentence. */
  | { kind: 'turn' }
  /** Go back to the previous page's last sentence. */
  | { kind: 'back' }
  | { kind: 'stop'; reason: ListenStop };

/** Previous, within this long of a sentence's start, goes to the sentence before; later, it says this one again. */
export const RESTART_WINDOW_MS = 1500;

/** The speeds offered, slowest first. */
export const LISTEN_RATES = [0.75, 1, 1.25] as const;
export type ListenRate = (typeof LISTEN_RATES)[number];

/** The next speed in the round (1 → 1.25 → 0.75 → 1). */
export function nextRate(rate: number): ListenRate {
  const at = LISTEN_RATES.indexOf(rate as ListenRate);
  return LISTEN_RATES[(at + 1) % LISTEN_RATES.length] ?? 1;
}

/** A page as the voice reads it, sentence by sentence. */
export function pageSentences(text: string): PageSentence[] {
  const out: PageSentence[] = [];
  splitParagraphs(text).forEach((paragraph, p) => {
    splitSentences(paragraph).forEach((sentence, s) => {
      const pieces = paragraphChunks([sentence]);
      if (pieces.length) out.push({ paragraph: p, sentence: s, text: sentence, pieces });
    });
  });
  return out;
}

/** The first sentence of a paragraph («play from here»); the page's first when it has none. */
export function sentenceOfParagraph(sentences: PageSentence[], paragraph: number): number {
  const at = sentences.findIndex((s) => s.paragraph >= paragraph);
  return at < 0 ? Math.max(0, sentences.length - 1) : at;
}

/** A sentence asked for (a remembered place, «the last one» when going back) kept on the page. */
export function clampSentence(index: number | 'last', count: number): number {
  if (count <= 0) return 0;
  if (index === 'last') return count - 1;
  return Math.min(Math.max(0, Math.floor(index)), count - 1);
}

/** The end of a page: turn by itself, or stop and say why. */
export function atPageEnd(facts: ListenFacts): ListenMove {
  if (!facts.hasNext) return { kind: 'stop', reason: 'end' };
  if (!facts.signedIn) return { kind: 'stop', reason: 'signIn' };
  if (!facts.pro) return { kind: 'stop', reason: 'pro' };
  return { kind: 'turn' };
}

/** Where a page begins: the sentence asked for, or — an empty page — the page-end rule. */
export function firstMove(index: number, count: number, facts: ListenFacts): ListenMove {
  return count > 0 ? { kind: 'speak', index: clampSentence(index, count) } : atPageEnd(facts);
}

/** After a sentence: again (repeat on), the next one, or the page-end rule — or stop when it was cut off. */
export function afterSentence(
  index: number,
  count: number,
  outcome: SpeakOutcome,
  repeat: boolean,
  facts: ListenFacts,
): ListenMove {
  if (outcome === 'cut') return { kind: 'stop', reason: 'interrupted' };
  if (outcome === 'unavailable') return { kind: 'stop', reason: 'silent' };
  if (repeat) return { kind: 'speak', index };
  return index + 1 < count ? { kind: 'speak', index: index + 1 } : atPageEnd(facts);
}

/** Next: the following sentence; on a page's last sentence, the page-end rule (Pro turns the page). */
export function stepNext(index: number, count: number, facts: ListenFacts): ListenMove {
  return index + 1 < count ? { kind: 'speak', index: index + 1 } : atPageEnd(facts);
}

/**
 * Previous: this sentence again once more than RESTART_WINDOW_MS of it was heard; otherwise
 * the one before — the previous page's last at the top of a page.
 */
export function stepPrev(index: number, heardMs: number, facts: ListenFacts): ListenMove {
  if (heardMs > RESTART_WINDOW_MS) return { kind: 'speak', index };
  if (index > 0) return { kind: 'speak', index: index - 1 };
  return facts.hasPrev ? { kind: 'back' } : { kind: 'speak', index: 0 };
}

/** Where listening was left in a book, kept in the desk's settings. */
export interface ListenPlace {
  page: number;
  sentence: number;
}

export const listenPlaceKey = (bookId: string) => `library_listen_${bookId}`;

/** The stored place, or null when it is missing or not a place. */
export function parseListenPlace(raw: string | null | undefined): ListenPlace | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ListenPlace>;
    const page = Number(v.page);
    const sentence = Number(v.sentence);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(sentence) || sentence < 0)
      return null;
    return { page, sentence };
  } catch {
    return null;
  }
}

/** A listener's pace for the «about n min» on the listen strip. */
export const LISTEN_WPM = 150;

/**
 * What the listen strip promises before play: how many sentences the page has and about how
 * long it takes to hear (words ÷ 150 a minute, never less than a minute).
 */
export function listenEstimate(
  text: string,
  wpm = LISTEN_WPM,
): { sentences: number; minutes: number } {
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return {
    sentences: pageSentences(text).length,
    minutes: words === 0 ? 0 : Math.max(1, Math.round(words / wpm)),
  };
}
