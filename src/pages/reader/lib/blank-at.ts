/** A printed blank: a run of ellipses, dots or underscores. */
const BLANK = /…{2,}|\.{4,}|_{3,}/g;

/**
 * The printed blank at a point on the page, if the click landed on or right
 * beside one.
 *
 * Textbook blanks are TEXT — "…………………" — so pdf.js knows exactly where each
 * one sits. Measured with a Range over just the dots, so a blank in the middle
 * of a sentence gives its own box, not the whole line's.
 */
export function blankAt(layer: HTMLElement, x: number, y: number): DOMRect | null {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let best: DOMRect | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const match of (node.textContent ?? '').matchAll(BLANK)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      for (const rect of range.getClientRects()) {
        const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        // Close enough to have meant it; any further and it is a click on the page.
        if (dx > 8 || dy > 10 || dx + dy >= bestDistance) continue;
        best = rect;
        bestDistance = dx + dy;
      }
    }
  }
  return best;
}
