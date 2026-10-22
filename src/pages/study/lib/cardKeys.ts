/**
 * The flashcard's keyboard, as a pure decision so it can be tested.
 *
 * Always on:   Enter/Space flip - 1..5 grade (only once flipped) - r replay the word -
 *              e next example - w previous example - t uncover one example meaning
 * Focus mode:  m reveal/hide the meaning - l switch the reveal layout
 *
 * The four always-on letters play audio or uncover a translation the card already
 * offers; none of them grades, navigates or ends anything, so they bind everywhere
 * the card is open. The other two change what the card IS, so a bare letter never
 * reshapes the session for someone only scrolling past it: focus mode only.
 */
export type CardKeyAction =
  | { type: 'flip' }
  | { type: 'replay' }
  | { type: 'nextExample' }
  | { type: 'prevExample' }
  | { type: 'exampleMeaning' }
  | { type: 'toggleMeaning' }
  | { type: 'toggleLayout' }
  | { type: 'grade'; rating: 1 | 2 | 3 | 4 | 5 };

export interface CardKeyContext {
  focusMode: boolean;
  /** The answer side is showing - grading is only allowed then. */
  isAnswer: boolean;
  /** A rating is being submitted - blocks a second one. */
  submittingRating: number | null;
}

export interface KeyLike {
  key: string;
  repeat?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}

export function resolveCardKey(e: KeyLike, ctx: CardKeyContext): CardKeyAction | null {
  // Never hijack typing or the OS's own shortcuts, and ignore auto-repeat.
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return null;
  const t = e.target;
  if (
    t &&
    (t.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes((t.tagName ?? '').toUpperCase()))
  ) {
    return null;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    // A focused button (Show answer, a rating, a menu item) is activated by these keys natively;
    // flipping as well would flip twice and leave the card where it was.
    if (['BUTTON', 'A'].includes((t?.tagName ?? '').toUpperCase())) return null;
    return { type: 'flip' };
  }

  const key = e.key.toLowerCase();
  if (key === 'r') return { type: 'replay' };
  if (key === 'e') return { type: 'nextExample' };
  if (key === 'w') return { type: 'prevExample' };
  if (key === 't') return { type: 'exampleMeaning' };
  if (ctx.focusMode) {
    if (key === 'm') return { type: 'toggleMeaning' };
    if (key === 'l') return { type: 'toggleLayout' };
  }
  if (ctx.isAnswer && ctx.submittingRating === null) {
    const rating = parseInt(e.key, 10);
    if (rating >= 1 && rating <= 5) return { type: 'grade', rating: rating as 1 | 2 | 3 | 4 | 5 };
  }
  return null;
}
