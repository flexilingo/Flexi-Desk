import { describe, expect, it } from 'vitest';
import { countWords, levelWords, overallLevel, toPodcastSegments } from '@/pages/videos/lib/transcript';

describe('video transcript -> player segments', () => {
  it('ends each rolling caption where the next begins, so exactly one matches at any time', () => {
    // YouTube auto-captions: every cue runs past the next cue's start.
    const segs = toPodcastSegments('e1', 'fr', [
      { start: 0, end: 4, text: 'bonjour à tous' },
      { start: 2, end: 6, text: 'bienvenue sur la chaîne' },
      { start: 5, end: 9, text: 'aujourd’hui on apprend' },
    ]);
    expect(segs.map((s) => [s.startMs, s.endMs])).toEqual([[0, 2000], [2000, 5000], [5000, 9000]]);
    for (let t = 0; t < 9000; t += 250) {
      const hits = segs.filter((s) => t >= s.startMs && t < s.endMs);
      expect(hits).toHaveLength(1);
    }
    // the line spoken at 3 s is the LAST cue that has started
    expect(segs.find((s) => 3000 >= s.startMs && 3000 < s.endMs)?.text).toBe('bienvenue sur la chaîne');
  });

  it('sorts, drops empty cues, and never produces a zero-length cue', () => {
    const segs = toPodcastSegments('e1', 'en', [
      { start: 5, end: 5, text: 'late' },
      { start: 1, end: 2, text: '   ' },
      { start: 0, end: 3, text: ' first  line ' },
    ]);
    expect(segs.map((s) => s.text)).toEqual(['first line', 'late']);
    expect(segs.every((s) => s.endMs > s.startMs)).toBe(true);
  });

  it('carries the language and the episode, and no word timings (the bar splits the text itself)', () => {
    const [s] = toPodcastSegments('ep', 'es', [{ start: 0, end: 1, text: 'hola', words: [{ word: 'hola', idx: 0 }] }]);
    expect(s).toMatchObject({ episodeId: 'ep', language: 'es', words: [] });
  });
});

describe('video vocabulary analysis', () => {
  it('counts words, lower-cased, skipping speaker marks and one-letter tokens', () => {
    const { total, counts } = countWords(['>> The cat and the Dog', 'a cat’s toy']);
    expect(counts.get('the')).toBe(2);
    expect(counts.get('cat')).toBe(1);
    expect(counts.has('>>')).toBe(false);
    expect(counts.has('a')).toBe(false);
    expect(total).toBe(counts.size + 1); // "the" twice
  });

  it('picks the level that covers 80% of the leveled words', () => {
    expect(overallLevel({ A1: 40, A2: 40, B1: 10, B2: 10 })).toBe('A2');
    expect(overallLevel({ A1: 10, B2: 90 })).toBe('B2');
    expect(overallLevel({})).toBeUndefined();
  });

  it('levels the words, most frequent first, unknown words kept', () => {
    const counts = new Map([['maison', 5], ['chat', 9], ['xyzzy', 2], ['le', 30]]);
    const levels = new Map([['maison', 'A1'], ['chat', 'A1'], ['le', 'A1']]);
    const { distribution, top } = levelWords(counts, levels);
    expect(distribution).toEqual({ A1: 3 });
    expect(top.map((t) => t.word)).toEqual(['chat', 'maison', 'xyzzy']); // "le" is too short for the vocab list
    expect(top.find((t) => t.word === 'xyzzy')?.cefr).toBe('unknown');
  });
});
