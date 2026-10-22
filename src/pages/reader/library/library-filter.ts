import type { CefrLevel, LibraryBook, LibraryFacets } from '../services/libraryService';

/**
 * The Library's filtering, sorting, paging and URL state, as pure functions.
 *
 * The whole catalogue (every language) is already in memory, so every filter works on it in
 * place with no request per click. Ported from the website's `LibraryBrowser`, which kept
 * all of this inline.
 */

export const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const KINDS = ['original', 'adapted', 'classic'] as const;
export type BookKind = (typeof KINDS)[number];
/** Two rows of six. */
export const PAGE_SIZE = 12;

export interface LibraryFilters {
  /** One language's books, or '' for every language together (the default). */
  language: string;
  level: CefrLevel | '';
  kind: BookKind | '';
  series: string;
  /** The committed search text (the box itself is debounced into this). */
  query: string;
  page: number;
}

export const EMPTY_FILTERS: LibraryFilters = {
  language: '',
  level: '',
  kind: '',
  series: '',
  query: '',
  page: 1,
};

/** Lowercase, accents dropped — so "etoile" finds "Étoile". */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Level, then series title, then the episode's place in it. */
export function sortBooks(books: LibraryBook[]): LibraryBook[] {
  return [...books].sort(
    (a, b) =>
      LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
      (a.series_title ?? '').localeCompare(b.series_title ?? '') ||
      (a.series_order ?? 0) - (b.series_order ?? 0),
  );
}

/** The books that pass every active filter, in shelf order. */
export function filterBooks(books: LibraryBook[], f: LibraryFilters): LibraryBook[] {
  const q = fold(f.query.trim());
  return sortBooks(
    books
      .filter((b) => !f.language || b.language === f.language)
      .filter((b) => !f.level || b.level === f.level)
      .filter((b) => !f.kind || b.kind === f.kind)
      .filter((b) => !f.series || b.series_slug === f.series)
      .filter((b) => !q || fold(`${b.title} ${b.author} ${b.series_title ?? ''}`).includes(q)),
  );
}

/** One page of results; a page past the end shows the last. */
export function pageOf<T>(items: T[], page: number, size = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), totalPages);
  return { current, totalPages, items: items.slice((current - 1) * size, current * size) };
}

export const hasActiveFilters = (f: LibraryFilters, searchText = f.query) =>
  Boolean(searchText || f.language || f.level || f.kind || f.series);

/**
 * The levels, kinds and series that actually exist in the chosen language (or in all of
 * them) — nothing is offered that matches nothing.
 */
export function availableFacets(books: LibraryBook[], facets: LibraryFacets, language: string) {
  const pool = language ? books.filter((b) => b.language === language) : books;
  return {
    levels: LEVEL_ORDER.filter((l) => pool.some((b) => b.level === l)),
    kinds: KINDS.filter((k) => pool.some((b) => b.kind === k)),
    series: language ? facets.series.filter((s) => s.language === language) : facets.series,
  };
}

/** A language from the URL that the library does not have is no filter at all. */
export const knownLanguage = (language: string, languages: { code: string }[]) =>
  language && languages.some((l) => l.code === language) ? language : '';

/**
 * Filters to a query string (`lang`, `level`, `type`, `series`, `q`, `page`). `lang` is the
 * language filter, so an old `?lang=fr` link opens the library with French picked.
 */
export function toSearchParams(f: LibraryFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (f.language) q.set('lang', f.language);
  if (f.level) q.set('level', f.level);
  if (f.kind) q.set('type', f.kind);
  if (f.series) q.set('series', f.series);
  if (f.query) q.set('q', f.query);
  if (f.page > 1) q.set('page', String(f.page));
  return q;
}

/** The inverse; anything unknown or malformed is ignored rather than trusted. */
export function fromSearchParams(q: URLSearchParams): LibraryFilters {
  const level = q.get('level') as CefrLevel | null;
  const kind = q.get('type');
  const page = parseInt(q.get('page') ?? '1', 10);
  return {
    language: q.get('lang') ?? '',
    level: level && LEVEL_ORDER.includes(level) ? level : '',
    kind: kind && (KINDS as readonly string[]).includes(kind) ? (kind as BookKind) : '',
    series: q.get('series') ?? '',
    query: q.get('q') ?? '',
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/**
 * The page buttons to draw: every page when there are few, otherwise the first, the last
 * and the neighbours of the current one, with `null` where pages are skipped.
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set([1, total, current - 1, current, current + 1]);
  const out: (number | null)[] = [];
  let last = 0;
  for (const n of [...keep].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)) {
    if (n - last > 1) out.push(null);
    out.push(n);
    last = n;
  }
  return out;
}
