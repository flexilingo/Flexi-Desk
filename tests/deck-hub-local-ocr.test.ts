import { describe, it, expect, vi } from 'vitest';

vi.mock('@/pages/reader/ocr/engine', () => ({ createOcrEngine: vi.fn() }));

import { fitScale, wordsToText } from '@/pages/review/lib/localOcr';

describe('wordsToText', () => {
  it('joins words per line and lines with newlines, in reading order', () => {
    const text = wordsToText({
      v: 1,
      lines: [
        [0, 0, 10, 10],
        [0, 12, 10, 22],
      ],
      words: [
        ['Hello', 0, 0, 5, 10, 0],
        ['world', 6, 0, 10, 10, 0],
        ['Second', 0, 12, 10, 22, 1],
        ['line', 11, 12, 15, 22, 1],
      ],
    });
    expect(text).toBe('Hello world\nSecond line');
  });
  it('is empty for a page with no words', () => {
    expect(wordsToText({ v: 1, lines: [], words: [] })).toBe('');
  });
});

describe('fitScale', () => {
  it('shrinks oversized photos and never enlarges', () => {
    expect(fitScale(8000, 6000)).toBe(0.5);
    expect(fitScale(1000, 800)).toBe(1);
  });
});
