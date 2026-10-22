import { describe, expect, it } from 'vitest';
import {
  continueTarget,
  progressFromShelf,
  showOrderNote,
} from '../src/pages/reader/library/series-progress';
import type { LibraryShelfItem } from '../src/pages/reader/services/libraryService';

// Only the fields series progress reads.
const item = (order: number, opts: { finished?: boolean; at?: string; slug?: string; language?: string } = {}) =>
  ({
    book_id: `b${order}`,
    last_page: 1,
    last_scroll_pct: 0,
    last_read_at: opts.at ?? null,
    added_at: '2026-10-01T00:00:00Z',
    finished_at: opts.finished ? '2026-10-02T00:00:00Z' : null,
    book: { series_slug: opts.slug ?? 'the-tuesday-class', language: opts.language ?? 'en', series_order: order },
  }) as unknown as LibraryShelfItem;

const episodes = [1, 2, 3, 21, 22].map((n) => ({ id: `b${n}`, series_order: n }));

describe('series progress (from the shelf)', () => {
  it('collects opened and finished episodes of this series only, and the one read last', () => {
    const p = progressFromShelf(
      [
        item(1, { finished: true, at: '2026-10-03T00:00:00Z' }),
        item(2, { at: '2026-10-05T00:00:00Z' }),
        item(7, { slug: 'other' }),
        item(3, { language: 'fr' }),
      ],
      'en',
      'the-tuesday-class',
    );
    expect([...p.opened].sort()).toEqual([1, 2]);
    expect([...p.finished]).toEqual([1]);
    expect(p.last).toBe(2);
  });

  it('continues with the episode read last, or the next one when it was finished — across seasons', () => {
    expect(continueTarget(episodes, progressFromShelf([item(2, { at: '2026-10-05T00:00:00Z' })], 'en', 'the-tuesday-class'))?.series_order).toBe(2);
    expect(continueTarget(episodes, progressFromShelf([item(3, { finished: true, at: '2026-10-05T00:00:00Z' })], 'en', 'the-tuesday-class'))?.series_order).toBe(21);
  });

  it('offers no "continue" for nothing read, the first episode, or a finished series', () => {
    expect(continueTarget(episodes, progressFromShelf([], 'en', 'the-tuesday-class'))).toBeNull();
    expect(continueTarget(episodes, progressFromShelf([item(1)], 'en', 'the-tuesday-class'))).toBeNull();
    expect(continueTarget(episodes, progressFromShelf([item(22, { finished: true })], 'en', 'the-tuesday-class'))).toBeNull();
  });

  it('suggests starting at episode 1 only when the episode before was never opened', () => {
    const p = progressFromShelf([item(2)], 'en', 'the-tuesday-class');
    expect(showOrderNote(3, p)).toBe(false);
    expect(showOrderNote(21, p)).toBe(true);
    expect(showOrderNote(1, p)).toBe(false);
  });
});
