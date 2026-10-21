import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { anchorSelection } from '@/pages/reader/lib/note-anchor';

/**
 * jsdom has no layout, so the geometry is injected: the page box and the
 * selection's box are what the anchor converts to percentages of the page.
 */
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

const original = Range.prototype.getBoundingClientRect;
let selectionBox = rect(100, 200, 50, 20);

beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => selectionBox;
  document.body.innerHTML = `
    <div data-page="3" id="p3">
      <div class="flexi-pdf-textlayer">
        <span data-run="4" id="a">alpha beta</span>
        <span data-run="9" id="b">gamma delta</span>
      </div>
    </div>
    <div data-page="4" id="p4"><span data-run="1" id="c">other page</span></div>`;
  for (const id of ['p3', 'p4']) {
    document.getElementById(id)!.getBoundingClientRect = () => rect(0, 100, 500, 1000);
  }
});
afterEach(() => {
  Range.prototype.getBoundingClientRect = original;
  window.getSelection()?.removeAllRanges();
});

function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('anchorSelection', () => {
  it('is null with nothing selected', () => {
    expect(anchorSelection()).toBeNull();
  });

  it('describes a selection as percentages of the page box, with page, quote and run range', () => {
    select(document.getElementById('a')!.firstChild!, 0, document.getElementById('b')!.firstChild!, 5);
    const anchor = anchorSelection()!;
    expect(anchor.pageNumber).toBe(3);
    expect(anchor.runStart).toBe(4);
    expect(anchor.runEnd).toBe(9);
    expect(anchor.quote).toBe('alpha beta gamma');
    // 100/500, (200-100)/1000, 50/500, 20/1000
    expect(anchor.rect).toEqual({ x: 20, y: 10, w: 10, h: 2 });
  });

  it('resolves an ELEMENT boundary through its child (a selection snapped out to whole words)', () => {
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    // Boundaries in the parent with an offset, as setStartBefore / setEndAfter leave them.
    select(a.parentElement!, 1, b.parentElement!, 4);
    const anchor = anchorSelection()!;
    expect(anchor.runStart).not.toBeNull();
    expect(anchor.runEnd).not.toBeNull();
  });

  it('refuses a selection that spans two pages', () => {
    select(document.getElementById('a')!.firstChild!, 0, document.getElementById('c')!.firstChild!, 3);
    expect(anchorSelection()).toBeNull();
  });

  it('refuses a selection with no area, and one outside any page', () => {
    selectionBox = rect(0, 0, 0, 0);
    select(document.getElementById('a')!.firstChild!, 0, document.getElementById('a')!.firstChild!, 3);
    expect(anchorSelection()).toBeNull();
    selectionBox = rect(100, 200, 50, 20);
    document.body.insertAdjacentHTML('beforeend', '<p id="loose">loose text</p>');
    select(document.getElementById('loose')!.firstChild!, 0, document.getElementById('loose')!.firstChild!, 4);
    expect(anchorSelection()).toBeNull();
  });

  it('clamps the rectangle into 0-100', () => {
    selectionBox = rect(-50, 50, 900, 20);
    select(document.getElementById('a')!.firstChild!, 0, document.getElementById('a')!.firstChild!, 3);
    const anchor = anchorSelection()!;
    expect(anchor.rect.x).toBe(0);
    expect(anchor.rect.w).toBe(100);
    expect(anchor.rect.y).toBe(0);
    selectionBox = rect(100, 200, 50, 20);
  });
});
