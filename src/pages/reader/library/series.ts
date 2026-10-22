import type { LibraryBookDetail } from '../services/libraryService';

/**
 * Series with seasons, as pure functions (ported from the website's book and series pages).
 * Everything here is inert on a backend that does not know seasons: no season fields means
 * one season, no `requires_login` means open, and a series without them keeps the old
 * "next episode is order + 1" behaviour.
 */

type Entry = LibraryBookDetail['series'][number];

export const seasonOf = (e: { series_season?: number | null }) => e.series_season ?? 1;

/** True when the series has more than the first season (the season labels only then matter). */
export const hasSeasons = (series: Entry[]) => series.some((e) => seasonOf(e) > 1);

/** Episodes in reading order: season, then place in the series. */
export function readingOrder(series: Entry[]): Entry[] {
  return [...series].sort(
    (a, b) => seasonOf(a) - seasonOf(b) || (a.series_order ?? 0) - (b.series_order ?? 0),
  );
}

/** The episode before and after this one, across season borders. */
export function neighbours(
  series: Entry[],
  bookId: string,
): { prev: Entry | null; next: Entry | null } {
  const list = readingOrder(series);
  const at = list.findIndex((e) => e.id === bookId);
  if (at < 0) return { prev: null, next: null };
  return { prev: at > 0 ? list[at - 1] : null, next: at < list.length - 1 ? list[at + 1] : null };
}

/** The episode after this one on a backend without seasons: order + 1. */
export function nextByOrder(series: Entry[], order: number | null | undefined): Entry | null {
  if (!order) return null;
  return series.find((e) => e.series_order === order + 1) ?? null;
}

/**
 * The page a reader may not open yet: season 2+ episodes keep page 1 open to everyone, the
 * rest needs a (free) account. Signed-in readers are never gated.
 */
export const isLoginGated = (
  book: { requires_login?: boolean } | undefined,
  page: number,
  signedIn: boolean,
) => book?.requires_login === true && !signedIn && page > 1;

/** Season name from the series row, else null (the caller falls back to "Season n"). */
export function seasonTitle(detail: LibraryBookDetail, n: number): string | null {
  return detail.series_meta?.seasons.find((s) => s.number === n)?.title ?? null;
}
