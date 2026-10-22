import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const call = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabaseCall: call }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) => (o ? `${key}${JSON.stringify(o)}` : key),
    i18n: { language: 'en', exists: () => true },
  }),
}));

import {
  answerShowsSeries,
  resetSeriesSupport,
  seriesSupported,
} from '@/pages/reader/library/library-capability';
import { getLibraryBook, getLibraryCatalog } from '@/pages/reader/services/libraryService';
import { LibraryBrowser } from '@/pages/reader/library/LibraryBrowser';
import { EMPTY_FILTERS } from '@/pages/reader/library/library-filter';
import {
  hasSeasons,
  isLoginGated,
  neighbours,
  nextByOrder,
  seasonOf,
} from '@/pages/reader/library/series';
import type { LibraryBook, LibrarySeriesCard } from '@/pages/reader/services/libraryService';

const facets = { languages: [{ code: 'en', count: 1 }], levels: [{ code: 'A1' as const, count: 1 }], series: [] };
const book = (over: Partial<LibraryBook> = {}): LibraryBook => ({
  id: 'b1', slug: 'b1', language: 'en', title: 'Story', author: 'FlexiLingo', kind: 'original', level: 'A1',
  summary: '', series_slug: null, series_title: null, series_order: null, tags: [], cover_path: null,
  word_count: 300, page_count: 2, license: 'own', source_url: null, attribution: null, published_at: null,
  updated_at: '2026-01-01', ...over,
});
const card: LibrarySeriesCard = {
  slug: 'tuesday', language: 'en', title: 'The Tuesday Class', summary: 'A class.', cover_path: null,
  episode_count: 40, season_count: 2, levels: ['A2', 'B1'],
};

beforeEach(() => {
  resetSeriesSupport();
  call.mockReset();
});
afterEach(() => resetSeriesSupport());

describe('series capability detection', () => {
  it('an old catalog answer (no series_list) leaves series off', async () => {
    call.mockResolvedValue({ books: [book()], facets });
    await getLibraryCatalog({ language: 'en' });
    expect(seriesSupported()).toBe(false);
  });

  it('a catalog answer carrying series_list switches series on, and it stays on', async () => {
    call.mockResolvedValueOnce({ books: [book()], facets, series_list: [card] });
    await getLibraryCatalog({ language: 'en' });
    expect(seriesSupported()).toBe(true);
    call.mockResolvedValueOnce({ books: [book()], facets });
    await getLibraryCatalog({ language: 'fr' });
    expect(seriesSupported()).toBe(true);
  });

  it('a failing request proves nothing', async () => {
    call.mockRejectedValue({ code: 'UNKNOWN_ERROR' });
    await expect(getLibraryCatalog({})).rejects.toBeTruthy();
    expect(seriesSupported()).toBe(false);
  });

  it('a book answer proves it by series_meta or the season fields, not by a plain old answer', async () => {
    expect(answerShowsSeries({ book: { id: 'x' }, series: [] })).toBe(false);
    expect(answerShowsSeries({ book: { id: 'x' }, series: [], series_meta: null })).toBe(true);
    expect(answerShowsSeries({ book: { id: 'x', requires_login: false } })).toBe(true);
    call.mockResolvedValue({ book: book(), first_page: null, series: [], series_meta: null });
    await getLibraryBook('b1');
    expect(seriesSupported()).toBe(true);
  });
});

describe('the library shelf', () => {
  const view = (cards: LibrarySeriesCard[], books: LibraryBook[] = [book()], language = '') =>
    render(
      <MemoryRouter>
        <LibraryBrowser
          books={books}
          facets={{ ...facets, languages: [{ code: 'en', count: 1 }, { code: 'fr', count: 1 }] }}
          filters={{ ...EMPTY_FILTERS, language }}
          onFiltersChange={() => {}}
          bookHref={(b) => `/reader/book/${b.id}`}
          onShelf={new Set()}
          seriesCards={cards}
        />
      </MemoryRouter>,
    );

  it('looks like the plain library when there are no series cards (old API): no tiles, no heading', () => {
    view([]);
    expect(screen.queryByTestId('library-series')).toBeNull();
    expect(screen.queryByText('series.tilesHeading')).toBeNull();
    expect(screen.getByTestId('library-grid')).toBeInTheDocument();
  });

  it('draws the series as picture tiles under the shelf, opening the series page', () => {
    view([{ ...card, cover_path: '/library/covers/en/tuesday.jpg' }]);
    const tiles = screen.getByTestId('library-series');
    const grid = screen.getByTestId('library-grid');
    // Under the shelf, not above it.
    expect(grid.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: /The Tuesday Class/ })).toHaveAttribute(
      'href',
      '/reader/library/series/en/tuesday',
    );
    expect(tiles.querySelector('img')).toHaveAttribute(
      'src',
      'https://flexilingo.com/library/covers/en/tuesday.jpg',
    );
  });

  it("a series without a cover takes its first episode's; with neither it gets no tile", () => {
    const episode = book({ id: 'e1', slug: 'tuesday-01', series_slug: 'tuesday', series_title: 'The Tuesday Class', series_order: 1, cover_path: '/c/e1.jpg' });
    view([card], [episode]);
    expect(screen.getByTestId('library-series').querySelector('img')).toHaveAttribute(
      'src',
      'https://flexilingo.com/c/e1.jpg',
    );
    cleanup();
    view([card]);
    expect(screen.queryByTestId('library-series')).toBeNull();
  });

  it('every language together: each card and tile names its language', () => {
    const fr = book({ id: 'f1', slug: 'f1', language: 'fr', title: 'Matin' });
    view([{ ...card, cover_path: '/c/s.jpg' }], [book(), fr]);
    const grid = screen.getByTestId('library-grid');
    expect(grid.querySelectorAll('li')).toHaveLength(2);
    expect(within(grid).getByText('English')).toHaveAttribute('lang', 'en');
    expect(within(grid).getByText('Français')).toHaveAttribute('lang', 'fr');
    expect(within(screen.getByTestId('library-series')).getByText('English')).toBeInTheDocument();
  });

  it('a picked language narrows the shelf and the tiles to it', () => {
    const fr = book({ id: 'f1', slug: 'f1', language: 'fr', title: 'Matin' });
    view([{ ...card, cover_path: '/c/s.jpg' }], [book(), fr], 'fr');
    expect(screen.getByTestId('library-grid').querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByText('Matin')).toBeInTheDocument();
    expect(screen.queryByTestId('library-series')).toBeNull();
  });
});

describe('episodes across seasons', () => {
  const ep = (id: string, order: number, season?: number) => ({
    id, slug: id, title: id, level: 'A2' as const, series_order: order, series_season: season,
  });
  const list = [ep('s2e1', 21, 2), ep('s1e1', 1, 1), ep('s1e2', 2, 1), ep('s2e2', 22, 2)];

  it('prev/next follow reading order and cross the season border', () => {
    expect(neighbours(list, 's1e2')).toMatchObject({ prev: { id: 's1e1' }, next: { id: 's2e1' } });
    expect(neighbours(list, 's1e1').prev).toBeNull();
    expect(neighbours(list, 's2e2').next).toBeNull();
    expect(neighbours(list, 'nope')).toEqual({ prev: null, next: null });
  });

  it('knows whether a series has seasons; a list without season fields is season 1', () => {
    expect(hasSeasons(list)).toBe(true);
    expect(hasSeasons([ep('a', 1), ep('b', 2)])).toBe(false);
    expect(seasonOf(ep('a', 1))).toBe(1);
  });

  it('without seasons the next episode is still order + 1', () => {
    const old = [ep('a', 1), ep('b', 2)];
    expect(nextByOrder(old, 1)?.id).toBe('b');
    expect(nextByOrder(old, 2)).toBeNull();
    expect(nextByOrder(old, null)).toBeNull();
  });
});

describe('the login rule', () => {
  it('page 1 is open to everyone; later pages of a login-only episode need an account', () => {
    expect(isLoginGated({ requires_login: true }, 1, false)).toBe(false);
    expect(isLoginGated({ requires_login: true }, 2, false)).toBe(true);
    expect(isLoginGated({ requires_login: true }, 2, true)).toBe(false);
    expect(isLoginGated({ requires_login: false }, 5, false)).toBe(false);
    expect(isLoginGated({}, 5, false)).toBe(false);
    expect(isLoginGated(undefined, 5, false)).toBe(false);
  });
});
