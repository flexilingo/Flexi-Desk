import { showShares, topShare, type FitShare } from '@/pages/podcast/utils/levelFit';
import type { CefrLevel, LibraryBook, LibrarySeriesCard } from '../services/libraryService';
import { coverFor, readingMinutes } from './format';
import { continueTarget, type SeriesProgress } from './series-progress';

/**
 * What the redesigned library pages say about a series and its episodes, as pure functions
 * (ported from the website's series page, list page and episode page): the "is this right
 * for you?" card's numbers, the season tab a page opens on, and the series tiles' picture.
 */

export type { FitShare };

/** The level most episodes are at — the easier one on a tie. Null without episodes. */
export const dominantLevel = (levels: CefrLevel[]): CefrLevel | null =>
  topShare(showShares(levels))?.level ?? null;

export interface SeriesFit {
  /** Episodes per level, only the levels that occur, easiest first. */
  shares: FitShare[] | null;
  /** The level holding the most episodes and its rounded percentage. */
  top: { level: CefrLevel; percent: number } | null;
  lowest: CefrLevel | null;
  highest: CefrLevel | null;
  /** Average reading time of one episode, in minutes. */
  avgMinutes: number | null;
  /** Seasons readable in full without an account. */
  freeSeasons: number[];
  /** Whether any season needs an account after page 1. */
  anyLogin: boolean;
}

/** The series fit card: how the episodes split across levels, how long one is, what is free. */
export function seriesFit(
  seasons: {
    number: number;
    requires_login: boolean;
    episodes: { level: CefrLevel; word_count: number }[];
  }[],
): SeriesFit {
  const episodes = seasons.flatMap((s) => s.episodes);
  const shares = showShares(episodes.map((e) => e.level));
  return {
    shares,
    top: topShare(shares),
    lowest: shares?.[0]?.level ?? null,
    highest: shares?.[shares.length - 1]?.level ?? null,
    avgMinutes: episodes.length
      ? Math.round(
          episodes.reduce((sum, e) => sum + readingMinutes(e.word_count), 0) / episodes.length,
        )
      : null,
    freeSeasons: seasons.filter((s) => !s.requires_login).map((s) => s.number),
    anyLogin: seasons.some((s) => s.requires_login),
  };
}

/**
 * The season tab a series page opens on: the season of the episode a returning reader
 * carries on with, else the first. A tab the reader picks wins over this (the caller's state).
 */
export function openingSeason(
  seasons: { number: number; episodes: { series_order: number | null }[] }[],
  progress: SeriesProgress,
): number | undefined {
  const resume = continueTarget(
    seasons.flatMap((s) => s.episodes),
    progress,
  );
  const holder = resume ? seasons.find((s) => s.episodes.includes(resume)) : undefined;
  return holder?.number ?? seasons[0]?.number;
}

/**
 * "Season 1: Room 4" → "Room 4" for a tab that already says "Season 1". A title without that
 * lead-in is kept whole.
 */
export function seasonName(title: string | null | undefined): string | null {
  if (!title) return null;
  const match = title.match(/^\D{0,20}\d+\s*[:：.–—-]\s*(.+)$/);
  return match ? match[1] : title;
}

/**
 * A series tile on the library page: its picture is the series' own cover, else the cover of
 * its first episode on the shelf (one with artwork first); its level badge is the level most
 * of those episodes are at. No picture at all (no cover, no episode loaded) → no tile.
 */
export function seriesTile(
  card: LibrarySeriesCard,
  books: LibraryBook[],
): { cover: string | null; level: CefrLevel | null } {
  const episodes = books
    .filter((b) => b.series_slug === card.slug && b.language === card.language)
    .sort(
      (a, b) =>
        (a.series_season ?? 1) - (b.series_season ?? 1) ||
        (a.series_order ?? 0) - (b.series_order ?? 0),
    );
  const withArt = episodes.find((e) => e.cover_path);
  const cover =
    card.cover_path ?? withArt?.cover_path ?? (episodes[0] ? coverFor(episodes[0]) : null);
  return {
    cover,
    level: dominantLevel(episodes.map((e) => e.level)) ?? card.levels[0] ?? null,
  };
}

/**
 * Where an episode sits, for "Episode 3 of 20 in season 2": its number and the count in its
 * season when the series has seasons, else its place in the whole series. Null when the
 * book is not in the list.
 */
export function episodePlace(
  series: {
    id: string;
    series_order: number;
    series_season?: number | null;
    series_episode?: number | null;
  }[],
  bookId: string,
): { n: number; total: number; season: number | null } | null {
  const book = series.find((e) => e.id === bookId);
  if (!book) return null;
  const seasonOf = (e: { series_season?: number | null }) => e.series_season ?? 1;
  const seasonal = series.some((e) => seasonOf(e) > 1);
  if (!seasonal) return { n: book.series_order, total: series.length, season: null };
  return {
    n: book.series_episode ?? book.series_order,
    total: series.filter((e) => seasonOf(e) === seasonOf(book)).length,
    season: seasonOf(book),
  };
}

type ListFormatCtor = new (
  locale: string,
  options: { type: 'conjunction' },
) => { format: (items: string[]) => string };

/** "1, 2 and 3" in the reader's language (the runtime's list format), else commas. */
export function joinList(items: string[], locale: string): string {
  const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;
  if (ListFormat) {
    try {
      return new ListFormat(locale, { type: 'conjunction' }).format(items);
    } catch {
      /* unknown locale: fall through */
    }
  }
  return items.join(', ');
}
