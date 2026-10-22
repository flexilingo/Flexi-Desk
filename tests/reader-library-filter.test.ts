import { describe, it, expect } from 'vitest';
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  availableFacets,
  filterBooks,
  fromSearchParams,
  pageOf,
  pageWindow,
  pickLanguage,
  sortBooks,
  toSearchParams,
} from '@/pages/reader/library/library-filter';
import { parseBookmark } from '@/pages/reader/library/bookmark';
import type { LibraryBook, LibraryFacets } from '@/pages/reader/services/libraryService';

const book = (id: string, over: Partial<LibraryBook> = {}): LibraryBook => ({
  id,
  slug: id,
  language: 'en',
  title: `Story ${id}`,
  author: 'A. Writer',
  kind: 'original',
  level: 'A1',
  summary: '',
  series_slug: null,
  series_title: null,
  series_order: null,
  tags: [],
  cover_path: null,
  word_count: 300,
  page_count: 3,
  license: 'own',
  source_url: null,
  attribution: null,
  published_at: null,
  updated_at: '2026-01-01',
  ...over,
});

const BOOKS = [
  book('c', { title: 'Étoile over Toronto', level: 'B1', author: 'Marie Tremblay' }),
  book('b', { title: 'A day in Vancouver', level: 'A2', series_slug: 'van', series_title: 'Vancouver Days', series_order: 2 }),
  book('a', { title: 'Morning in Vancouver', level: 'A2', series_slug: 'van', series_title: 'Vancouver Days', series_order: 1 }),
  book('d', { title: 'Old Quebec', level: 'A1', kind: 'classic' }),
];

describe('library filtering and sort', () => {
  it('sorts by level, then series title, then episode', () => {
    expect(sortBooks(BOOKS).map((b) => b.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('folds accents and searches title, author and series', () => {
    expect(filterBooks(BOOKS, { ...EMPTY_FILTERS, query: 'etoile' }).map((b) => b.id)).toEqual(['c']);
    expect(filterBooks(BOOKS, { ...EMPTY_FILTERS, query: 'TREMBLAY' }).map((b) => b.id)).toEqual(['c']);
    expect(filterBooks(BOOKS, { ...EMPTY_FILTERS, query: 'vancouver days' }).map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('combines level, type and series', () => {
    expect(filterBooks(BOOKS, { ...EMPTY_FILTERS, level: 'A2' }).map((b) => b.id)).toEqual(['a', 'b']);
    expect(filterBooks(BOOKS, { ...EMPTY_FILTERS, kind: 'classic' }).map((b) => b.id)).toEqual(['d']);
    expect(filterBooks(BOOKS, { ...EMPTY_FILTERS, series: 'van', level: 'A1' })).toEqual([]);
  });

  it('offers only the levels, kinds and series that exist', () => {
    const facets: LibraryFacets = {
      languages: [{ code: 'en', count: 4 }],
      levels: [{ code: 'B1', count: 1 }, { code: 'A1', count: 1 }],
      series: [
        { slug: 'van', title: 'Vancouver Days', language: 'en', count: 2 },
        { slug: 'fr', title: 'Autre', language: 'fr', count: 1 },
      ],
    };
    const f = availableFacets(BOOKS, facets, 'en');
    expect(f.levels).toEqual(['A1', 'B1']);
    expect(f.kinds).toEqual(['original', 'classic']);
    expect(f.series.map((s) => s.slug)).toEqual(['van']);
  });
});

describe('paging', () => {
  const many = Array.from({ length: 30 }, (_, i) => i);
  it('shows 12 per page and clamps the page', () => {
    expect(PAGE_SIZE).toBe(12);
    expect(pageOf(many, 1).items).toHaveLength(12);
    expect(pageOf(many, 3)).toMatchObject({ current: 3, totalPages: 3 });
    expect(pageOf(many, 3).items).toHaveLength(6);
    expect(pageOf(many, 99).current).toBe(3);
    expect(pageOf([], 4)).toMatchObject({ current: 1, totalPages: 1, items: [] });
  });
  it('draws a short window with gaps', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(1, 20)).toEqual([1, 2, null, 20]);
    expect(pageWindow(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(pageWindow(20, 20)).toEqual([1, null, 19, 20]);
  });
});

describe('URL state', () => {
  it('round-trips language and every filter', () => {
    const filters = { level: 'B2' as const, kind: 'adapted' as const, series: 'van', query: 'Étoile', page: 3 };
    const q = toSearchParams(filters, 'fr');
    expect(q.toString()).toBe('lang=fr&level=B2&type=adapted&series=van&q=%C3%89toile&page=3');
    expect(fromSearchParams(new URLSearchParams(q.toString()))).toEqual({ lang: 'fr', filters });
  });
  it('is empty when nothing is set, and ignores junk', () => {
    expect(toSearchParams(EMPTY_FILTERS, null).toString()).toBe('');
    const parsed = fromSearchParams(new URLSearchParams('level=Z9&type=novel&page=-4'));
    expect(parsed).toEqual({ lang: null, filters: EMPTY_FILTERS });
    expect(fromSearchParams(new URLSearchParams('page=abc')).filters.page).toBe(1);
  });
});

describe('language choice', () => {
  const langs = [{ code: 'fr' }, { code: 'en' }, { code: 'es' }];
  it('prefers the URL, then the learning language, then English, then the first', () => {
    expect(pickLanguage(langs, 'es', 'fr')).toBe('es');
    expect(pickLanguage(langs, 'zz', 'fr')).toBe('fr');
    expect(pickLanguage(langs, null, 'de')).toBe('en');
    expect(pickLanguage([{ code: 'es' }], null, 'de')).toBe('es');
    expect(pickLanguage([], null, 'en')).toBeUndefined();
  });
});

describe('signed-out bookmark', () => {
  it('only a page after the first is a bookmark', () => {
    expect(parseBookmark('7')).toBe(7);
    expect(parseBookmark('1')).toBeUndefined();
    expect(parseBookmark('x')).toBeUndefined();
    expect(parseBookmark(null)).toBeUndefined();
  });
});
