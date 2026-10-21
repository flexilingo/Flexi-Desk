import { describe, it, expect, beforeEach } from 'vitest';
import { PDF_WORD_MARKERS, snapRange, snapSelectionToWords } from '@/pages/reader/text/snap-selection';

/** A text layer: "His voice was almost inaudible. He left" with `inaudible` split over two runs. */
function buildLayer() {
  document.body.innerHTML = `
    <div class="flexi-pdf-textlayer">
      <span id="r1">His <span class="flexi-pdf-word" data-group="1">voice</span> <span class="flexi-pdf-word" data-group="2">was</span> </span>
      <span id="r2"><span class="flexi-pdf-word" data-group="3">inau</span><span class="flexi-pdf-word" data-group="3">dible</span>. </span>
      <span id="r3"><span class="flexi-pdf-word" data-group="4">He</span> left</span>
    </div>`;
}

const textOf = (range: Range) => range.toString().replace(/\s+/g, ' ').trim();

beforeEach(buildLayer);

describe('snapRange', () => {
  it('rounds both ends out to the words they fell inside', () => {
    const voice = document.querySelector('[data-group="1"]')!.firstChild!;
    const dible = document.querySelector('[data-group="3"]:last-child')!.firstChild!;
    const range = document.createRange();
    range.setStart(voice, 2); // "ic" of voice
    range.setEnd(dible, 2); // "di" of dible
    const snapped = snapRange(range, PDF_WORD_MARKERS)!;
    // The split word is taken whole, and the sentence's own full stop stays with it.
    expect(textOf(snapped)).toBe('voice was inaudible.');
  });

  it('leaves out what lies outside the first and last word', () => {
    const was = document.querySelector('[data-group="2"]')!.nextSibling!; // the space after "was"
    const he = document.querySelector('[data-group="4"]')!.firstChild!;
    const range = document.createRange();
    range.setStart(was, 0);
    range.setEnd(he, 1);
    expect(textOf(snapRange(range, PDF_WORD_MARKERS)!)).toBe('inaudible. He');
  });

  it('returns null when no word is touched at all', () => {
    const tail = document.querySelector('#r3')!.lastChild!; // " left" — plain text
    const range = document.createRange();
    range.setStart(tail, 1);
    range.setEnd(tail, 3);
    expect(snapRange(range, PDF_WORD_MARKERS)).toBeNull();
  });
});

describe('snapSelectionToWords', () => {
  it('rewrites the live selection once, then is idempotent', () => {
    const voice = document.querySelector('[data-group="1"]')!.firstChild!;
    const was = document.querySelector('[data-group="2"]')!.firstChild!;
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(voice, 2, was, 1);
    snapSelectionToWords(PDF_WORD_MARKERS);
    expect(textOf(selection.getRangeAt(0))).toBe('voice was');
    snapSelectionToWords(PDF_WORD_MARKERS);
    expect(textOf(selection.getRangeAt(0))).toBe('voice was');
  });
});
