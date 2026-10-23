import type { LibraryBookDetail } from '../services/libraryService';
import { coverFor } from '../library/format';
import { hasSeasons, neighbours, nextByOrder, seasonOf } from '../library/series';

/** A book as the player bar holds it. */
export interface ListenSource {
  bookId: string;
  title: string;
  /** "The Tuesday Class · Season 2 · Episode 3", or the author. */
  subtitle: string;
  language: string;
  coverPath: string | null;
  /** A later season: signed out, only page 1 can be read. */
  requiresLogin: boolean;
  /** The book's place in its series, counted across seasons; null when it is not a serial episode. */
  seriesOrder: number | null;
  /** The episode after it, where the player goes on at the end of the book; null when there is none. */
  nextEpisode: { bookId: string; order: number } | null;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The player's view of a library book from its detail answer: the reader page builds it when
 * listening starts, the player itself when it goes on to the next episode. `withSeries` is the
 * backend's series support (seasons, the previous / next across seasons).
 */
export function listenSourceOf(
  detail: LibraryBookDetail,
  withSeries: boolean,
  t: Translate,
): ListenSource {
  const book = detail.book;
  const seasonal = withSeries && hasSeasons(detail.series);
  const label =
    withSeries && book.series_order
      ? seasonal
        ? t('series.seasonEpisode', {
            season: seasonOf(book),
            n: book.series_episode ?? book.series_order,
          })
        : t('catalog.episode', { n: book.series_order })
      : null;
  const next = withSeries
    ? neighbours(detail.series, book.id).next
    : nextByOrder(detail.series, book.series_order);
  return {
    bookId: book.id,
    title: book.title,
    subtitle:
      book.series_title && label
        ? `${book.series_title} · ${label}`
        : t('book.by', { author: book.author }),
    language: book.language,
    coverPath: coverFor(book),
    requiresLogin: book.requires_login === true,
    seriesOrder: book.series_slug && book.series_order ? book.series_order : null,
    nextEpisode: next ? { bookId: next.id, order: next.series_order } : null,
  };
}
