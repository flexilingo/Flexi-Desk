import { supabaseCall } from '@/lib/supabase';

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

export const getLibraryCatalog = (args: LibraryCatalogArgs = {}) => {
  const p = new URLSearchParams({ action: 'catalog' });
  if (args.language) p.set('language', args.language);
  if (args.level) p.set('level', args.level);
  if (args.series) p.set('series', args.series);
  return supabaseCall<{ books: LibraryBook[]; facets: LibraryFacets }>('GET', `/library?${p}`);
};

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
  first_page: { page_number: number; chapter_title: string | null; content: string } | null;
  series: { id: string; slug: string; title: string; level: CefrLevel; series_order: number }[];
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
}

export const getLibraryBook = (bookId: string) =>
  supabaseCall<LibraryBookDetail>(
    'GET',
    `/library?action=book&book_id=${encodeURIComponent(bookId)}`,
  );

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
