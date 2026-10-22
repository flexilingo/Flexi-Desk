import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const call = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabaseCall: call }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) => (o ? `${key}${JSON.stringify(o)}` : key),
    i18n: { language: 'en', exists: () => true },
  }),
  Trans: ({ i18nKey, values, count }: { i18nKey: string; values?: object; count?: number }) => (
    <span>{`${i18nKey}${JSON.stringify({ ...values, ...(count != null ? { count } : {}) })}`}</span>
  ),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { useAuthStore } from '@/stores/authStore';
import { SeriesPage } from '@/pages/reader/library/SeriesPage';
import type { LibraryEpisode, LibrarySeriesPage } from '@/pages/reader/services/libraryService';

const episode = (order: number, season: number, n: number, level: 'B1' | 'B2' = 'B1'): LibraryEpisode => ({
  id: `e${order}`,
  slug: `tuesday-${order}`,
  title: `Episode title ${order}`,
  level,
  summary: '',
  series_season: season,
  series_order: order,
  series_episode: n,
  requires_login: season > 1,
  cover_path: null,
  word_count: 1500,
  page_count: 5,
});

const SERIES: LibrarySeriesPage = {
  series: {
    slug: 'tuesday',
    language: 'en',
    title: 'The Tuesday Class',
    summary: 'A free class in Toronto every Tuesday evening.',
    cover_path: '/library/covers/en/tuesday.jpg',
    episode_count: 4,
  },
  seasons: [
    { number: 1, title: 'Season 1: Room 4', summary: null, level: null, requires_login: false, episodes: [episode(1, 1, 1), episode(2, 1, 2)] },
    { number: 2, title: 'Season 2: The New Room', summary: 'A new room.', level: null, requires_login: true, episodes: [episode(3, 2, 1, 'B2'), episode(4, 2, 2)] },
  ],
};

const shelfItem = (order: number, finished: boolean, at: string) => ({
  book_id: `e${order}`,
  last_page: 1,
  last_scroll_pct: 0,
  last_read_at: at,
  added_at: at,
  finished_at: finished ? at : null,
  book: { series_slug: 'tuesday', language: 'en', series_order: order },
});

function open(shelf: unknown[] | null) {
  useAuthStore.setState({ session: (shelf ? { user: { id: 'u' } } : null) as never, isLoading: false });
  call.mockImplementation((...args: unknown[]) => {
    const path = args.map(String).join(' ');
    return path.includes('action=series')
      ? Promise.resolve(SERIES)
      : path.includes('action=shelf')
        ? Promise.resolve({ items: shelf ?? [] })
        : Promise.reject({ code: 'UNKNOWN_ERROR' });
  });
  return render(
    <MemoryRouter initialEntries={['/reader/library/series/en/tuesday']}>
      <Routes>
        <Route path="/reader/library/series/:language/:slug" element={<SeriesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  call.mockReset();
});

describe('the series page', () => {
  it('a new reader: the band, "start with episode 1", season 1 open, the fit card', async () => {
    open(null);
    expect(await screen.findByRole('heading', { level: 1, name: 'The Tuesday Class' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /series\.start/ })).toHaveAttribute('href', '/reader/book/e1');
    const tab1 = screen.getByRole('tab', { name: /series\.season\{"n":1\}/ });
    expect(tab1).toHaveAttribute('aria-selected', 'true');
    // The tab names the season without repeating "Season 1:".
    expect(within(tab1).getByText('Room 4')).toBeInTheDocument();
    expect(screen.getByText('Episode title 1')).toBeInTheDocument();
    expect(screen.queryByText('Episode title 3')).toBeNull();
    // Fit: 3 of 4 episodes are B1, 15 min each, season 1 free, the rest after sign-in.
    expect(screen.getAllByText('series.fitTitle').length).toBeGreaterThan(0);
    expect(screen.getAllByText('series.fitMostly{"percent":"75","level":"B1"}').length).toBeGreaterThan(0);
    expect(screen.getAllByText('series.fitMinutes{"minutes":"15"}').length).toBeGreaterThan(0);
    expect(screen.getAllByText('series.fitAccess{"list":"1","count":1}').length).toBeGreaterThan(0);
  });

  it('picking a season shows its episodes and its sign-in note', async () => {
    open(null);
    fireEvent.click(await screen.findByRole('tab', { name: /series\.season\{"n":2\}/ }));
    expect(screen.getByText('Episode title 3')).toBeInTheDocument();
    expect(screen.queryByText('Episode title 1')).toBeNull();
    expect(screen.getByText('A new room.')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('series.loginNote');
  });

  it("a returning reader: continue, and the continue episode's season opens with ticks", async () => {
    open([
      shelfItem(1, true, '2026-10-01T10:00:00Z'),
      shelfItem(2, true, '2026-10-02T10:00:00Z'),
      shelfItem(3, false, '2026-10-03T10:00:00Z'),
    ]);
    expect(
      await screen.findByRole('link', { name: /series\.continue/ }),
    ).toHaveAttribute('href', '/reader/book/e3');
    expect(screen.getByRole('tab', { name: /series\.season\{"n":2\}/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('link', { name: 'series.startOver' })).toHaveAttribute('href', '/reader/book/e1');
    fireEvent.click(screen.getByRole('tab', { name: /series\.season\{"n":1\}/ }));
    expect(screen.getAllByLabelText('series.readMark')).toHaveLength(2);
  });
});
