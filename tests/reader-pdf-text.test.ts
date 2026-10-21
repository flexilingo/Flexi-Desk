import { describe, it, expect } from 'vitest';
import { segmentRuns, type RunMetrics } from '@/pages/reader/lib/word-segments';
import { buildLineContext, groupLines, isWordBrokenAcross } from '@/pages/reader/lib/line-context';
import { stepZoom, ZOOM_MAX, ZOOM_MIN } from '@/pages/reader/text/zoom';
import { stepTextScale, parseTextScale, TEXT_SCALE_MAX, TEXT_SCALE_MIN } from '@/pages/reader/text/text-scale';

describe('groupLines', () => {
  it('groups runs by the baseline that opened the line, not by their neighbour', () => {
    // 0.5 steps never drift a whole line height: the third run is 1.0 away from the opener.
    expect(groupLines([10, 10.5, 11, 20])).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 2 },
      { start: 3, end: 3 },
    ]);
  });

  it('never joins runs whose position is not a number', () => {
    expect(groupLines([Number.NaN, Number.NaN])).toHaveLength(2);
  });
});

describe('isWordBrokenAcross', () => {
  it('needs a letter, a hyphen and a lower-case continuation', () => {
    expect(isWordBrokenAcross('a rain so pen-', 'etrating')).toBe(true);
    expect(isWordBrokenAcross('a rain so pen-', 'Etrating')).toBe(false);
    expect(isWordBrokenAcross('page 12 -', 'etrating')).toBe(false);
  });
});

describe('buildLineContext', () => {
  it('returns the whole line the run is on', () => {
    const strings = ['The quick brown fox jumps over the lazy dog', 'Next line that is long enough to stand alone'];
    expect(buildLineContext(0, [10, 20], strings)).toBe(strings[0]);
  });

  it('adds the next line when its own is a heading', () => {
    // The producer emits its own space, as most do: runs are glued as they are.
    const strings = ['Chapter 1 ', 'It was a bright cold day in April.'];
    expect(buildLineContext(0, [10, 20], strings)).toBe('Chapter 1 It was a bright cold day in April.');
  });

  it('mends a word broken over a line break', () => {
    const strings = ['It was a rain so pen-', 'etrating, that we all stayed in the house.'];
    const context = buildLineContext(0, [10, 20], strings);
    expect(context).toContain('penetrating');
    expect(context).not.toContain('pen-');
  });

  it('is empty for an index outside the page', () => {
    expect(buildLineContext(5, [10], ['x'])).toBe('');
  });
});

describe('segmentRuns', () => {
  it('rejoins a word a ligature split across runs, with one shared group', () => {
    const out = segmentRuns(['indé', 'fi', 'nis'], [10, 10, 10]);
    const words = out.flat().map((p) => p.word);
    expect(words).toEqual(['indéfinis', 'indéfinis', 'indéfinis']);
    expect(new Set(out.flat().map((p) => p.group)).size).toBe(1);
  });

  it('treats a visible gap between runs as the space the producer never wrote', () => {
    const metrics: RunMetrics[] = [
      { left: 0, right: 50, height: 10 },
      { left: 56, right: 70, height: 10 }, // 6 > 10 * 0.22
    ];
    const joined = segmentRuns(['définis', 'le'], [10, 10]);
    expect(joined.flat().map((p) => p.word)).toEqual(['définisle', 'définisle']);
    const apart = segmentRuns(['définis', 'le'], [10, 10], metrics);
    expect(apart.flat().map((p) => p.word)).toEqual(['définis', 'le']);
  });

  it('keeps the characters of each run exactly as they were', () => {
    const strings = ['Hello, ', 'world!'];
    const out = segmentRuns(strings, [5, 5]);
    expect(out.map((pieces) => pieces.map((p) => p.text).join(''))).toEqual(strings);
  });

  it('gives both halves of a hyphenated line break the whole word, in separate groups', () => {
    const out = segmentRuns(['a rain so pen-', 'etrating, that'], [10, 20]);
    const head = out[0].find((p) => p.text === 'pen-' || p.text === 'pen');
    const tail = out[1].find((p) => p.text === 'etrating');
    expect(head?.word).toBe('penetrating');
    expect(tail?.word).toBe('penetrating');
    expect(head?.group).not.toBe(tail?.group);
  });

  it('gives punctuation and spacing no word', () => {
    const out = segmentRuns([' , '], [1]);
    expect(out[0].every((p) => p.word === null && p.group === null)).toBe(true);
  });
});

describe('zoom and text scale ladders', () => {
  it('steps to the next stop and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });

  it('rounds the text scale and clamps it', () => {
    expect(stepTextScale(1.05, 1)).toBe(1.15);
    expect(stepTextScale(TEXT_SCALE_MAX, 1)).toBe(TEXT_SCALE_MAX);
    expect(stepTextScale(TEXT_SCALE_MIN, -1)).toBe(TEXT_SCALE_MIN);
    expect(parseTextScale('2.5')).toBeNull();
    expect(parseTextScale('1.2')).toBe(1.2);
  });
});
