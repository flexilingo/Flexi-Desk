import { paragraphChunks } from '@/components/lookup/ParagraphSpeakButton';
import { splitParagraphs, splitSentences } from '@/components/lookup/tokenize';
import type { SpeakOutcome } from '@/lib/speech';

/**
 * The «Listen» player's order of reading, as pure functions: a page is read paragraph by
 * paragraph, each paragraph in the same pieces the paragraph speaker uses, and at the end of
 * a page the player turns to the next one — or stops, and says why.
 *
 * Who may go on past a page: reading the page on screen is free for everyone; turning to the
 * next page by itself is Pro. A signed-out reader is first asked to sign in, a signed-in
 * reader without Pro is offered Pro. The speaker after each paragraph stays free.
 */

/** A place on a page: which paragraph, which piece of it. */
export interface ListenAt {
  paragraph: number;
  chunk: number;
}

/** What the page-end rule needs to know about the reader and the book. */
export interface ListenFacts {
  /** There is a page after this one. */
  hasNext: boolean;
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
  /** Something else spoke (a paragraph speaker, a word), or stop was pressed elsewhere. */
  | 'interrupted'
  /** No voice could say it. */
  | 'silent';

export type ListenMove =
  | { kind: 'speak'; at: ListenAt }
  | { kind: 'turn' }
  | { kind: 'stop'; reason: ListenStop };

/**
 * A page as the voice reads it: every paragraph's pieces. Paragraph n here is paragraph n on
 * screen (both split the page the same way); a paragraph with nothing to say has no pieces.
 */
export function pagePieces(text: string): string[][] {
  return splitParagraphs(text).map((p) => paragraphChunks(splitSentences(p)));
}

/** The first piece at or after `from`, skipping paragraphs with nothing to say; null at the page's end. */
export function pieceFrom(pieces: string[][], from: ListenAt): ListenAt | null {
  for (let p = Math.max(0, from.paragraph); p < pieces.length; p++) {
    const start = p === from.paragraph ? Math.max(0, from.chunk) : 0;
    if (start < pieces[p].length) return { paragraph: p, chunk: start };
  }
  return null;
}

/** The piece after this one: the rest of the paragraph, then the next paragraph. */
export const pieceAfter = (pieces: string[][], at: ListenAt): ListenAt | null =>
  pieceFrom(pieces, { paragraph: at.paragraph, chunk: at.chunk + 1 });

/** The end of a page: turn by itself, or stop and say why. */
export function atPageEnd(facts: ListenFacts): ListenMove {
  if (!facts.hasNext) return { kind: 'stop', reason: 'end' };
  if (!facts.signedIn) return { kind: 'stop', reason: 'signIn' };
  if (!facts.pro) return { kind: 'stop', reason: 'pro' };
  return { kind: 'turn' };
}

/** Where to begin (Listen, Resume, or a fresh page): the piece at `from`, else the page-end rule. */
export function firstMove(pieces: string[][], from: ListenAt, facts: ListenFacts): ListenMove {
  const at = pieceFrom(pieces, from);
  return at ? { kind: 'speak', at } : atPageEnd(facts);
}

/** After a piece: the next one if it ran to its end, else stop. */
export function nextMove(
  pieces: string[][],
  at: ListenAt,
  outcome: SpeakOutcome,
  facts: ListenFacts,
): ListenMove {
  if (outcome === 'cut') return { kind: 'stop', reason: 'interrupted' };
  if (outcome === 'unavailable') return { kind: 'stop', reason: 'silent' };
  const next = pieceAfter(pieces, at);
  return next ? { kind: 'speak', at: next } : atPageEnd(facts);
}
