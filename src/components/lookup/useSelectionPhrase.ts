import { useCallback, useEffect, useRef, useState } from 'react';
import { snapRange } from '@/pages/reader/text/snap-selection';

export interface SelectionChip {
  x: number;
  /** Top of the selection, for a chip that has to sit above it. */
  y: number;
  /** Bottom of the selection — where the chip goes when there is room below. */
  bottom: number;
  text: string;
  context?: string;
}

/**
 * Ceiling on the context sent with a phrase.
 *
 * The container used to be handed over whole, which was fine when it was a
 * paragraph and wrong the moment a PDF page became one: a page's text layer is
 * thousands of characters, all of which would ride along with a three-word
 * phrase.
 */
const MAX_CONTEXT_CHARS = 320;

/**
 * Longest selection that still counts as a phrase — a select-all is not one,
 * but a whole sentence is, and a sentence in a real book often runs past the
 * 220 characters this used to allow.
 */
const MAX_PHRASE_CHARS = 400;

/**
 * How long the chip outlives its selection.
 *
 * On a touch screen the tap that lands on the chip is ALSO a tap on the page:
 * the browser drops the selection first, and a chip that vanished the instant
 * the selection did was gone before the tap reached it — the phrase could be
 * chosen but never translated. Long enough for the tap to land, short enough
 * that a chip nobody is reaching for still goes away.
 */
const HIDE_DELAY_MS = 300;

const SENTENCE_END = /[.!?…。！？]["'”’)\]]*\s/g;

/**
 * The sentence (or sentences) a phrase sits in, rather than the phrase itself.
 *
 * A reader's page is often one paragraph of two thousand characters, so the
 * paragraph is no context either. The phrase's own sentence is what makes
 * "almost inaudible" translatable as the man's voice and not as a sound level.
 */
function sentenceAround(block: string, phrase: string): string {
  const text = block.replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_CONTEXT_CHARS) return text;
  const at = text.indexOf(phrase);
  if (at < 0) return phrase;

  let start = 0;
  let end = text.length;
  for (const m of text.matchAll(SENTENCE_END)) {
    const boundary = m.index! + m[0].length;
    if (boundary <= at) start = boundary;
    else if (boundary >= at + phrase.length) {
      end = boundary;
      break;
    }
  }
  const sentence = text.slice(start, end).trim();
  return sentence.length <= MAX_CONTEXT_CHARS ? sentence : phrase;
}

/**
 * Tracks a native text selection inside lookup-enabled text and reports where
 * to float a "translate this phrase" chip.
 *
 * The selection is rounded to whole words HERE, from the selection itself,
 * rather than relying on the page having rewritten it on mouseup: on a phone
 * the reader drags handles and there is no mouseup, so the chip used to offer
 * whatever half-words the handles stopped on.
 *
 * Lifted by COPY from `features/exam/components/WordLookupProvider.tsx`, not
 * moved out of it: the CELPIP exam engine is designated untouchable, so the two
 * implementations are allowed to be duplicates. The `data-lookup-text` marker
 * name is kept identical so the two cannot silently diverge in which text they
 * consider selectable.
 */
export function useSelectionPhrase(enabled: boolean): {
  chip: SelectionChip | null;
  consume: () => SelectionChip | null;
} {
  const [chip, setChip] = useState<SelectionChip | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;

    const hide = () => {
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setChip(null), HIDE_DELAY_MS);
    };

    const updateFromSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return hide();

      const raw = sel.getRangeAt(0);
      const anchor = raw.commonAncestorContainer;
      const container = (anchor instanceof Element ? anchor : anchor.parentElement)?.closest(
        '[data-lookup-text]',
      );
      // Measured before rounding: rounding a select-all would mean walking every
      // word on the page on every selectionchange of the drag.
      if (!container || raw.toString().length > MAX_PHRASE_CHARS + 40) return hide();

      const range = snapRange(raw) ?? raw;
      // Paragraphs joined by a space: `Range.toString()` glues the last word of
      // one paragraph to the first of the next ("address?""2517").
      const copy = range.cloneContents();
      copy.querySelectorAll('p').forEach((p) => p.append(' '));
      const text = (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
      // Phrases only — a single word already opens on click.
      if (!text || !text.includes(' ') || text.length > MAX_PHRASE_CHARS) return hide();

      // Anchored to the LAST line of the selection, where the drag ended and
      // the pointer is — not to the middle of a box spanning every line.
      // (One rect per word box, not per line — so the last line is every box
      // sharing the last box's row.)
      const boxes = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (boxes.length === 0) return hide();
      const first = boxes[0];
      const last = boxes[boxes.length - 1];
      const lastLine = boxes.filter((r) => Math.abs(r.top - last.top) < last.height / 2);
      const lineLeft = Math.min(...lastLine.map((r) => r.left));
      const lineRight = Math.max(...lastLine.map((r) => r.right));

      const paragraph = (
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement
      )?.closest('p');

      clearTimeout(hideTimer.current);
      setChip({
        x: (lineLeft + lineRight) / 2,
        y: first.top,
        bottom: last.bottom,
        text,
        context: sentenceAround((paragraph ?? container).textContent ?? '', text),
      });
    };

    document.addEventListener('selectionchange', updateFromSelection);
    // The chip is viewport-fixed, so it has to follow scroll and resize.
    window.addEventListener('scroll', updateFromSelection, true);
    window.addEventListener('resize', updateFromSelection);
    return () => {
      clearTimeout(hideTimer.current);
      document.removeEventListener('selectionchange', updateFromSelection);
      window.removeEventListener('scroll', updateFromSelection, true);
      window.removeEventListener('resize', updateFromSelection);
    };
  }, [enabled]);

  /** Read the pending chip and clear both it and the browser selection. */
  const consume = useCallback((): SelectionChip | null => {
    if (!chip) return null;
    clearTimeout(hideTimer.current);
    window.getSelection()?.removeAllRanges();
    setChip(null);
    return chip;
  }, [chip]);

  return { chip, consume };
}
