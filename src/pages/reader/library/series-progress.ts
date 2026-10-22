import type { LibraryShelfItem } from '../services/libraryService';

/**
 * A reader's place in one series, from the shelf (signed in): which episodes were opened
 * (opening a book puts it on the shelf), which were read to the end, and the one read last.
 * Ported from the website's series progress. It only guides — it never locks an episode.
 * Episodes are identified by `series_order`, which counts across seasons (S2E1 = 21).
 */
export type SeriesProgress = { opened: Set<number>; finished: Set<number>; last: number | null };

export const EMPTY_PROGRESS: SeriesProgress = { opened: new Set(), finished: new Set(), last: null };

export function progressFromShelf(items: LibraryShelfItem[], language: string, slug: string): SeriesProgress {
  const opened = new Set<number>();
  const finished = new Set<number>();
  let last: number | null = null;
  let lastAt = '';
  for (const item of items) {
    const b = item.book;
    if (b.series_slug !== slug || b.language !== language || !b.series_order) continue;
    opened.add(b.series_order);
    if (item.finished_at) finished.add(b.series_order);
    const at = item.last_read_at ?? item.added_at;
    if (at > lastAt) {
      lastAt = at;
      last = b.series_order;
    }
  }
  return { opened, finished, last };
}

/**
 * Where "Continue" leads: the episode read last, or the one after it when that one was
 * finished. Null when there is nothing to continue (nothing read yet, the series is done,
 * or the place is episode 1 — then "Start with episode 1" says it already).
 */
export function continueTarget<E extends { series_order: number | null }>(
  episodes: E[],
  progress: SeriesProgress,
): E | null {
  if (!progress.last) return null;
  const at = episodes.findIndex((e) => e.series_order === progress.last);
  if (at < 0) return null;
  const target = progress.finished.has(progress.last) ? (episodes[at + 1] ?? null) : episodes[at];
  return target && target !== episodes[0] ? target : null;
}

/** The gentle "the story starts with episode 1" note: an episode after the first whose
 * previous episode was never opened. */
export function showOrderNote(order: number | null | undefined, progress: SeriesProgress): boolean {
  return !!order && order > 1 && !progress.opened.has(order - 1);
}

export const orderNoteSettingKey = (language: string, slug: string) =>
  `library.orderNoteClosed.${language}.${slug}`;
