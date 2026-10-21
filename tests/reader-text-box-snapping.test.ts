import { describe, it, expect, beforeEach } from 'vitest';
import { blankAt } from '@/pages/reader/lib/blank-at';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

/** jsdom has no layout: every Range reports a box proportional to its text, one line high. */
beforeEach(() => {
  document.body.innerHTML = `<div id="layer"><span>Write the word …………… here and ____ there</span></div>`;
  Range.prototype.getClientRects = function () {
    const text = this.toString();
    const before = (this.startContainer.textContent ?? '').slice(0, this.startOffset).length;
    return [rect(10 + before * 5, 100, text.length * 5, 12)] as unknown as DOMRectList;
  };
});

const layer = () => document.getElementById('layer')!;

describe('blankAt (snap a new text box to a printed blank)', () => {
  it('finds the blank a click landed on, and only that blank', () => {
    // "Write the word " = 15 chars -> the dots start at x = 10 + 75 = 85, 5 ellipses = 25 wide.
    const hit = blankAt(layer(), 100, 105)!;
    expect(hit.left).toBe(85);
    expect(hit.width).toBe(25);
    // The underscores are another blank, further along the same line.
    const other = blankAt(layer(), 10 + 30 * 5 + 5, 105)!;
    expect(other.left).toBe(10 + 30 * 5);
  });

  it('accepts a click just beside the blank, not one far from it', () => {
    expect(blankAt(layer(), 85 - 6, 105)).not.toBeNull();
    expect(blankAt(layer(), 85 - 30, 105)).toBeNull();
    expect(blankAt(layer(), 100, 100 + 12 + 40)).toBeNull();
  });

  it('is null on a page with no blank', () => {
    layer().innerHTML = '<span>Nothing to fill in here.</span>';
    expect(blankAt(layer(), 50, 105)).toBeNull();
  });
});
