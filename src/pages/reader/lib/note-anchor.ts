/**
 * Pinning a note to a place on a page.
 *
 * A note has to come back to the same words tomorrow, on a different screen, at
 * a different zoom — so nothing here may be stored in pixels. The rectangle is
 * captured as PERCENTAGES of the page box, which is the one frame of reference
 * that survives all three: the page box IS the PDF page, so a note at 42% down
 * is at 42% down on a phone and on a monitor.
 *
 * The run range is captured too. It is the more precise anchor — it names the
 * actual text runs rather than a region — but run numbering belongs to the
 * parser, so it is stored as a hint alongside the geometry rather than instead
 * of it.
 */

export interface NoteAnchor {
  pageNumber: number;
  quote: string;
  runStart: number | null;
  runEnd: number | null;
  /** Percentages of the page box, 0-100. */
  rect: { x: number; y: number; w: number; h: number };
}

const clampPct = (n: number) => Math.min(100, Math.max(0, Number(n.toFixed(2))));

/**
 * The element a range boundary actually sits on.
 *
 * A boundary is not always inside a text node. `snapSelectionToWords` rounds
 * the selection out with `setStartBefore`/`setEndAfter`, which leaves the
 * boundary in the PARENT with an offset — and the parent is the run, which
 * carries no `data-run` of its own. Reading `startContainer` alone therefore
 * found nothing and every note was saved with no text anchor at all, silently,
 * leaving only the rectangle. So an element boundary is resolved through its
 * child at the offset, which is the word that was actually selected.
 */
function boundaryElement(container: Node, offset: number, edge: 'start' | 'end'): Element | null {
  if (container.nodeType === Node.TEXT_NODE) return container.parentElement;
  const element = container as Element;
  // An end boundary sits AFTER the last selected child, so it is the one before.
  const index = edge === 'start' ? offset : Math.max(0, offset - 1);
  const child = element.childNodes[index];
  if (!child) return element;
  return child.nodeType === Node.TEXT_NODE ? child.parentElement : (child as Element);
}

/**
 * Describe the current selection, if it is inside a rendered page.
 *
 * Returns null rather than guessing when the selection spans two pages: a note
 * that claims to be on one page while half its text is on another would draw a
 * highlight over the wrong paragraph, which is worse than refusing.
 */
export function anchorSelection(): NoteAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const startEl = boundaryElement(range.startContainer, range.startOffset, 'start');
  const endEl = boundaryElement(range.endContainer, range.endOffset, 'end');

  const page = startEl?.closest<HTMLElement>('[data-page]');
  if (!page || page !== endEl?.closest('[data-page]')) return null;

  const pageBox = page.getBoundingClientRect();
  if (pageBox.width === 0 || pageBox.height === 0) return null;

  const box = range.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;

  const runs = [
    startEl?.closest<HTMLElement>('[data-run]'),
    endEl?.closest<HTMLElement>('[data-run]'),
  ]
    .map((el) => (el?.dataset.run !== undefined ? Number(el.dataset.run) : null))
    .filter((n): n is number => n !== null && Number.isFinite(n));

  return {
    pageNumber: Number(page.dataset.page) || 1,
    quote: selection.toString().replace(/\s+/g, ' ').trim().slice(0, 2000),
    runStart: runs.length ? Math.min(...runs) : null,
    runEnd: runs.length ? Math.max(...runs) : null,
    rect: {
      x: clampPct(((box.left - pageBox.left) / pageBox.width) * 100),
      y: clampPct(((box.top - pageBox.top) / pageBox.height) * 100),
      w: clampPct((box.width / pageBox.width) * 100),
      h: clampPct((box.height / pageBox.height) * 100),
    },
  };
}
