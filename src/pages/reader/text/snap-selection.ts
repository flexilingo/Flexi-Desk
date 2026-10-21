/**
 * Rounding a drag out to whole words.
 *
 * A PDF's text layer is real selectable text, so the browser does what it does
 * everywhere else: a drag starts and ends on the character under the cursor,
 * which lands mid-word far more often than not. On ordinary prose that is the
 * right behaviour — here it is not, because the selection is an INPUT to a
 * translation, and `sin de presse pour entrer avec humour dan` is not a phrase
 * anyone can translate.
 *
 * So both ends are pushed out to the word they fell inside. Words already carry
 * their own spans for tapping, so the boundaries are known exactly and nothing
 * has to be re-derived from text offsets — and a word the PDF split across runs
 * is pulled in whole through its group, not just the piece that was touched.
 */

/**
 * Which elements count as words, and how far a word's pieces may be gathered.
 *
 * Two surfaces need this and they mark their words differently: a PDF splits
 * one word across several runs and groups them with `data-group`, while
 * reflowing text renders one span per word and has nothing to gather. So the
 * selectors are an argument, and the grouping is optional.
 */
export interface WordMarkers {
  /** Selector for one word, or one piece of one. */
  word: string;
  /** Selector for the container a word's pieces may be gathered from. */
  layer: string;
  /** Attribute tying the pieces of a split word together. Omitted, a word is one element. */
  groupAttr?: string;
}

export const PDF_WORD_MARKERS: WordMarkers = {
  word: '.flexi-pdf-word',
  layer: '.flexi-pdf-textlayer',
  groupAttr: 'group',
};

/** One span per word, inside the block the lookup already marks. */
export const TEXT_WORD_MARKERS: WordMarkers = {
  word: '[data-flexi-word]',
  layer: '[data-lookup-text]',
};

/** The markers for whichever surface this node is on. */
export function markersFor(node: Node): WordMarkers {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(PDF_WORD_MARKERS.layer) ? PDF_WORD_MARKERS : TEXT_WORD_MARKERS;
}

/**
 * The full run of pieces one word is made of.
 *
 * Scoped to the word's own page: group numbers restart on every text layer, so
 * an unscoped query would reach into a neighbouring page and select half a book.
 */
function piecesOf(word: HTMLElement, markers: WordMarkers): HTMLElement[] {
  if (!markers.groupAttr) return [word];
  const group = word.dataset[markers.groupAttr];
  const layer = word.closest(markers.layer);
  if (!group || !layer) return [word];
  const pieces = [...layer.querySelectorAll<HTMLElement>(`[data-${markers.groupAttr}="${group}"]`)];
  return pieces.length ? pieces : [word];
}

/**
 * Does the range actually cover any of this word's text?
 *
 * Not `intersectsNode`: a drag that begins exactly at the end of one word
 * "intersects" it while selecting none of it, and rounding would then swallow
 * a neighbour the reader deliberately left out.
 */
function covers(range: Range, word: HTMLElement): boolean {
  const overlap = document.createRange();
  overlap.selectNodeContents(word);
  if (range.compareBoundaryPoints(Range.START_TO_START, overlap) > 0) {
    overlap.setStart(range.startContainer, range.startOffset);
  }
  if (range.compareBoundaryPoints(Range.END_TO_END, overlap) < 0) {
    overlap.setEnd(range.endContainer, range.endOffset);
  }
  return !overlap.collapsed && overlap.toString().trim() !== '';
}

/**
 * The range rounded to words: from the start of the first word it touches to
 * the end of the last.
 *
 * One rule does both jobs. A word cut in half is taken whole, and whatever lies
 * OUTSIDE the first and last word — the `."` a drag started on, the space it
 * ended in — is left out, so `." His voice was almost inaudible. He` comes back
 * as `His voice was almost inaudible. He`. Null when no word is touched at all.
 */
export function snapRange(
  range: Range,
  markers: WordMarkers = markersFor(range.commonAncestorContainer),
): Range | null {
  const root = range.commonAncestorContainer;
  const scope = root instanceof Element ? root : root.parentElement;
  if (!scope) return null;

  // The ancestor may itself be inside a word (a drag within one word).
  const own = scope.closest<HTMLElement>(markers.word);
  const words = own
    ? [own]
    : [...scope.querySelectorAll<HTMLElement>(markers.word)].filter((w) => range.intersectsNode(w));

  let first: HTMLElement | undefined;
  for (const w of words) {
    if (covers(range, w)) {
      first = w;
      break;
    }
  }
  let last: HTMLElement | undefined;
  for (let i = words.length - 1; i >= 0; i--) {
    if (covers(range, words[i])) {
      last = words[i];
      break;
    }
  }
  if (!first || !last) return null;

  const snapped = document.createRange();
  snapped.setStartBefore(piecesOf(first, markers)[0]);
  const end = piecesOf(last, markers).at(-1)!;
  snapped.setEndAfter(end);

  // A sentence keeps its own ending — "It is empty." is a statement, "It is
  // empty?" a question, and the translation differs. Only a mark that sits
  // right against the last word: a finger lifts ON the word, rarely past it.
  const after = end.nextSibling;
  if (after?.nodeType === Node.TEXT_NODE) {
    const mark = /^[.!?…。！？]+["'”’»)]?/.exec(after.textContent ?? '');
    if (mark) snapped.setEnd(after, mark[0].length);
  }
  return snapped;
}

/**
 * Round the live selection to whole words. Safe to call on every mouseup: it
 * rewrites the selection only when that actually changes it, so it cannot feed
 * its own `selectionchange`.
 */
export function snapSelectionToWords(markers?: WordMarkers): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const snapped = snapRange(range, markers);
  if (!snapped) return;

  const unchanged =
    snapped.compareBoundaryPoints(Range.START_TO_START, range) === 0 &&
    snapped.compareBoundaryPoints(Range.END_TO_END, range) === 0;
  if (unchanged) return;

  // A backwards drag has to stay backwards, or the handle the reader is still
  // holding jumps to the other end of the selection mid-gesture.
  const backwards =
    selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset;

  selection.removeAllRanges();
  if (backwards) {
    selection.setBaseAndExtent(
      snapped.endContainer,
      snapped.endOffset,
      snapped.startContainer,
      snapped.startOffset,
    );
  } else {
    selection.addRange(snapped);
  }
}
