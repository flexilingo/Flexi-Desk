import { supabaseCall } from '@/lib/supabase';
import { noteSeriesSupport } from '../library/library-capability';

/**
 * The cloud Library, through `supabaseCall` (never `fetch` from JS). Names follow
 * the website's `libraryApi.ts`. Only used while signed in; callers skip it
 * otherwise and show their local documents alone.
 */

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** A published library book — mirrors `BOOK_COLUMNS` in core `functions/library`. */
export interface LibraryBook {
  id: string;
  slug: string;
  language: string;
  title: string;
  author: string;
  kind: 'original' | 'classic' | 'adapted';
  level: CefrLevel;
  summary: string;
  series_slug: string | null;
  series_title: string | null;
  series_order: number | null;
  /** Season within the series; absent on a backend without series seasons. */
  series_season?: number | null;
  /** Number within the season, for display (series_order runs across seasons). */
  series_episode?: number | null;
  /** Later seasons of a serial: signed-out readers get page 1 only. */
  requires_login?: boolean;
  tags: string[];
  cover_path: string | null;
  word_count: number;
  page_count: number;
  license: 'own' | 'public_domain' | 'cc0' | 'cc_by' | 'cc_by_sa';
  source_url: string | null;
  attribution: string | null;
  published_at: string | null;
  updated_at: string;
}

export interface LibraryFacets {
  languages: { code: string; count: number }[];
  levels: { code: CefrLevel; count: number }[];
  series: { slug: string; title: string; language: string; count: number }[];
}

/** A series card on the library page: `series_list` of the catalog answer (new backends only). */
export interface LibrarySeriesCard {
  slug: string;
  language: string;
  title: string;
  summary: string;
  cover_path: string | null;
  episode_count: number;
  season_count: number;
  levels: CefrLevel[];
}

/** One episode on a series page. */
export interface LibraryEpisode {
  id: string;
  slug: string;
  title: string;
  level: CefrLevel;
  summary: string;
  series_season: number;
  series_order: number | null;
  series_episode: number | null;
  requires_login: boolean;
  cover_path: string | null;
  word_count: number;
  page_count: number;
}

export interface LibrarySeason {
  number: number;
  title: string | null;
  summary: string | null;
  level: string | null;
  requires_login: boolean;
  episodes: LibraryEpisode[];
}

/** `library?action=series` */
export interface LibrarySeriesPage {
  series: {
    slug: string;
    language: string;
    title: string;
    summary: string;
    cover_path: string | null;
    episode_count: number;
  };
  seasons: LibrarySeason[];
}

export interface LibraryShelfItem {
  book_id: string;
  last_page: number;
  last_scroll_pct: number;
  last_read_at: string | null;
  added_at: string;
  finished_at: string | null;
  book: LibraryBook;
}

export interface LibraryCatalogArgs {
  language?: string;
  level?: string;
  series?: string;
}

export const getLibraryCatalog = async (args: LibraryCatalogArgs = {}) => {
  const p = new URLSearchParams({ action: 'catalog' });
  if (args.language) p.set('language', args.language);
  if (args.level) p.set('level', args.level);
  if (args.series) p.set('series', args.series);
  const r = await supabaseCall<{
    books: LibraryBook[];
    facets: LibraryFacets;
    series_list?: LibrarySeriesCard[];
  }>('GET', `/library?${p}`);
  // The answer itself says whether the backend knows series: no extra probe request.
  noteSeriesSupport(r);
  return r;
};

/** One series with its published episodes by season (`library?action=series`, public). */
export const getLibrarySeries = (language: string, slug: string) =>
  supabaseCall<LibrarySeriesPage>(
    'GET',
    `/library?action=series&language=${encodeURIComponent(language)}&slug=${encodeURIComponent(slug)}`,
  );

export const getLibraryShelf = () =>
  supabaseCall<{ items: LibraryShelfItem[] }>('GET', '/library?action=shelf');

export const addToLibraryShelf = (body: { book_id: string }) =>
  supabaseCall<{ ok: boolean; book_id: string }>('POST', '/library?action=shelf-add', body);

export const removeFromLibraryShelf = (body: { book_id: string }) =>
  supabaseCall<{ ok: boolean }>('POST', '/library?action=shelf-remove', body);

export const setLibraryPosition = (body: { book_id: string; page: number; scroll_pct?: number }) =>
  supabaseCall<{ ok: boolean; last_page: number }>('POST', '/library?action=set-position', body);

/** A book's meta, its first page and the other episodes of its series (`library?action=book`, public). */
export interface LibraryBookDetail {
  book: LibraryBook;
  first_page: {
    page_number: number;
    chapter_title: string | null;
    content: string;
    audio?: LibraryPageAudio | null;
  } | null;
  series: {
    id: string;
    slug: string;
    title: string;
    level: CefrLevel;
    series_order: number;
    series_season?: number | null;
    series_episode?: number | null;
    requires_login?: boolean;
  }[];
  /** Season titles; present only on a backend that knows series seasons. */
  series_meta?: { title: string; seasons: { number: number; title: string | null }[] } | null;
}

/** One word of a page's pre-generated narration, when it is said (seconds into the file). */
export interface LibraryWordTiming {
  word: string;
  start_s: number;
  end_s: number;
}

/**
 * A page's pre-generated, multi-voice narration (`library_page_audio`) — most pages have none.
 * `word_timing` is flat, in the page's reading order: one entry per word `tokenize` finds.
 */
export interface LibraryPageAudio {
  audio_url: string;
  duration_s: number;
  word_timing: LibraryWordTiming[];
}

/** One page of a book (`library?action=page` / `public-page`). */
export interface LibraryPage {
  book_id: string;
  title: string;
  language: string;
  page_number: number;
  page_count: number;
  chapter_title: string | null;
  content: string;
  word_count: number;
  char_count: number;
  truncated: boolean;
  has_prev: boolean;
  has_next: boolean;
  /** The page's pre-generated narration; null (or absent, on an older backend) for none. */
  audio?: LibraryPageAudio | null;
}

export const getLibraryBook = async (bookId: string) => {
  const r = await supabaseCall<LibraryBookDetail>(
    'GET',
    `/library?action=book&book_id=${encodeURIComponent(bookId)}`,
  );
  noteSeriesSupport(r);
  return r;
};

/** Needs an account. */
export const getLibraryPage = (bookId: string, page: number) =>
  supabaseCall<LibraryPage>(
    'GET',
    `/library?action=page&book_id=${encodeURIComponent(bookId)}&page=${page}`,
  );

/** Any page of a published book, no account needed. */
export const getPublicLibraryPage = (bookId: string, page: number) =>
  supabaseCall<LibraryPage>(
    'GET',
    `/library?action=public-page&book_id=${encodeURIComponent(bookId)}&page=${page}`,
  );
