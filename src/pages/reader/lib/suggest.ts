import type { CefrLevel, LibraryBook, LibraryShelfItem } from '../services/libraryService';

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const isLevel = (value: string | null | undefined): value is CefrLevel =>
  !!value && (LEVELS as string[]).includes(value);

const byLevelThenSeries = (a: LibraryBook, b: LibraryBook) =>
  LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) ||
  (a.series_title ?? '').localeCompare(b.series_title ?? '') ||
  (a.series_order ?? 0) - (b.series_order ?? 0);

/**
 * What to read next, for the row under the reading list.
 *
 * The next episode of a series the reader is in comes first — that is the
 * book they are most likely to want. The rest are books at their level that
 * are not on their list yet, in series order.
 *
 * `continueWith` is the sequel of the book they read last, when they finished
 * it — what the reading home leads with instead of "read again".
 *
 * The level is the placement test's when the library has books at it, else the
 * level of whatever they read last, else the easiest the library has.
 */
export function suggestBooks(
  catalog: LibraryBook[],
  shelf: LibraryShelfItem[],
  language: string | undefined,
  placementLevel: string | null | undefined,
  count = 6,
): { level: CefrLevel | null; books: LibraryBook[]; continueWith: LibraryBook | null } {
  const inLanguage = catalog.filter((b) => b.language === (language ?? catalog[0]?.language));
  if (inLanguage.length === 0) return { level: null, books: [], continueWith: null };

  const onShelf = new Set(shelf.map((i) => i.book_id));
  const recent = [...shelf].sort(
    (a, b) => Date.parse(b.last_read_at ?? b.added_at) - Date.parse(a.last_read_at ?? a.added_at),
  );

  const available = new Set(inLanguage.map((b) => b.level));
  const level =
    (isLevel(placementLevel) && available.has(placementLevel) ? placementLevel : null) ??
    recent.map((i) => i.book.level).find((l) => available.has(l)) ??
    LEVELS.find((l) => available.has(l)) ??
    null;

  const nextOf = (book: LibraryBook) =>
    book.series_slug && book.series_order
      ? inLanguage.find(
          (b) => b.series_slug === book.series_slug && b.series_order === book.series_order! + 1,
        )
      : undefined;
  const nextEpisodes = recent
    .map(({ book }) => nextOf(book))
    .filter((b): b is LibraryBook => !!b && !onShelf.has(b.id));

  // The book they just finished, if it has a sequel they have not started: the
  // one thing the reading home should offer first.
  const latest = recent[0];
  const sequel = latest?.finished_at ? nextOf(latest.book) : undefined;
  const continueWith = sequel && !onShelf.has(sequel.id) ? sequel : null;

  // Once everything at their level is on the list, the row moves up a level
  // rather than going empty.
  const from = level ? LEVELS.indexOf(level) : 0;
  const ahead = inLanguage
    .filter((b) => !onShelf.has(b.id) && LEVELS.indexOf(b.level) >= from)
    .sort(byLevelThenSeries);

  const seen = new Set<string>();
  const books = [...nextEpisodes, ...ahead]
    .filter((b) => !seen.has(b.id) && !!seen.add(b.id))
    .slice(0, count);
  return { level, books, continueWith };
}
