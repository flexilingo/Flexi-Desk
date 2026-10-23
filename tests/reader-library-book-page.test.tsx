import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const settings = vi.hoisted(() => new Map<string, string>());
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string, args?: { key?: string }) =>
    command === 'get_setting' ? (settings.get(args?.key ?? '') ?? null) : [],
  ),
  convertFileSrc: (p: string) => p,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
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

// The voice itself is not under test here: every piece "runs to its end" at once.
vi.mock('@/lib/speech', async (original) => ({
  ...(await original<typeof import('@/lib/speech')>()),
  speakThrough: vi.fn(async () => 'ended'),
}));

import { fireEvent, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { BookPage } from '@/pages/reader/library/BookPage';
import { useListenStore } from '@/pages/reader/listen/listenStore';
import { resetSeriesSupport } from '@/pages/reader/library/library-capability';

const entry = (order: number, season: number, n: number) => ({
  id: `e${order}`,
  slug: `tuesday-${order}`,
  title: `Episode title ${order}`,
  level: 'B1',
  series_order: order,
  series_season: season,
  series_episode: n,
  requires_login: season > 1,
});
const SERIES = [entry(1, 1, 1), entry(2, 1, 2), entry(3, 2, 1), entry(4, 2, 2)];

const bookOf = (order: number) => ({
  id: `e${order}`,
  slug: `tuesday-${order}`,
  language: 'en',
  title: `Episode title ${order}`,
  author: 'FlexiLingo',
  kind: 'original',
  level: 'B1',
  summary: 'Grace prepares her first class in Toronto.',
  series_slug: 'tuesday',
  series_title: 'The Tuesday Class',
  series_order: order,
  series_season: order > 2 ? 2 : 1,
  series_episode: order > 2 ? order - 2 : order,
  requires_login: order > 2,
  tags: [],
  cover_path: null,
  word_count: 1500,
  page_count: 2,
  license: 'own',
  source_url: null,
  attribution: null,
  published_at: null,
  updated_at: '2026-01-01',
});

function open(order: number, pageCount = 2) {
  call.mockImplementation((...args: unknown[]) => {
    const path = args.map(String).join(' ');
    if (path.includes('action=book'))
      return Promise.resolve({
        book: { ...bookOf(order), page_count: pageCount },
        first_page: null,
        series: SERIES,
        series_meta: { title: 'The Tuesday Class', seasons: [{ number: 1, title: 'Room 4' }, { number: 2, title: 'The New Room' }] },
      });
    if (path.includes('action=series'))
      return Promise.resolve({
        series: { slug: 'tuesday', language: 'en', title: 'The Tuesday Class', summary: '', cover_path: null, episode_count: 4 },
        seasons: [1, 2].map((n) => ({
          number: n,
          title: null,
          summary: null,
          level: null,
          requires_login: n > 1,
          episodes: SERIES.filter((e) => e.series_season === n).map((e) => ({ ...e, summary: '', cover_path: null, word_count: 1200 + e.series_order * 100, page_count: 2 })),
        })),
      });
    if (path.includes('page'))
      return Promise.resolve({
        book_id: `e${order}`,
        title: 'x',
        language: 'en',
        page_number: 1,
        page_count: pageCount,
        chapter_title: null,
        content: 'Margaret arrived at the library at noon.',
        word_count: 7,
        char_count: 40,
        truncated: false,
        has_prev: false,
        has_next: pageCount > 1,
      });
    return Promise.resolve({ items: [] });
  });
  return render(
    <MemoryRouter initialEntries={[`/reader/book/e${order}`]}>
      <Routes>
        <Route path="/reader/book/:bookId" element={<BookPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => useListenStore.getState().close());

beforeEach(() => {
  call.mockReset();
  settings.clear();
  resetSeriesSupport();
  useAuthStore.setState({ session: null, isLoading: false });
});

describe('a library episode, laid out like the website', () => {
  it('the header, this season’s episodes with minutes, the fit card and the way on', async () => {
    open(3);
    expect(await screen.findByRole('heading', { level: 1, name: 'Episode title 3' })).toBeInTheDocument();
    // Breadcrumb back to the library (language preselected) and to the series.
    expect(screen.getByRole('link', { name: 'book.backToLibrary' })).toHaveAttribute('href', '/reader/library?lang=en');
    expect(screen.getAllByRole('link', { name: 'The Tuesday Class' })[0]).toHaveAttribute(
      'href',
      '/reader/library/series/en/tuesday',
    );
    // Season 2 only, the current episode marked, minutes from the series answer.
    const lists = await screen.findAllByRole('list');
    const season = lists.find((l) => l.tagName === 'OL')!;
    expect(within(season).getAllByRole('listitem')).toHaveLength(2);
    expect(within(season).getByText('Episode title 3').closest('[aria-current="page"]')).not.toBeNull();
    expect(await within(season).findByText('catalog.minutes{"n":15}')).toBeInTheDocument();
    // Fit: 2 pages, episode 1 of 2 in season 2, page 1 free signed out.
    expect(screen.getByText('public.fitTitleEpisode')).toBeInTheDocument();
    expect(screen.getByText('public.fitLength{"minutes":"15","count":2}')).toBeInTheDocument();
    expect(screen.getByText('public.fitEpisodeOfSeason{"n":"1","total":"2","season":"2"}')).toBeInTheDocument();
    expect(screen.getByText('public.fitLogin{}')).toBeInTheDocument();
    // Previous episode crosses back into season 1.
    expect(screen.getAllByRole('link', { name: /series\.prevEpisode.*Episode title 2/ })[0]).toHaveAttribute(
      'href',
      '/reader/book/e2',
    );
  });

  it('on the last page Next gives way to «Next episode: title»', async () => {
    open(1, 1);
    const next = await screen.findByRole('link', { name: /series\.nextEpisode: Episode title 2/ });
    expect(next).toHaveAttribute('href', '/reader/book/e2');
    // Only the toolbar's own page arrow is left; the pager's Next gave its place.
    expect(screen.getAllByRole('button', { name: 'read.next' })).toHaveLength(1);
  });

  it('signed in, an episode opened out of order says the story starts at episode 1', async () => {
    useAuthStore.setState({ session: { user: { id: 'u' } } as never, isLoading: false });
    open(3);
    expect(await screen.findByText(/series\.orderNote\{/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'series.orderNoteLink' })).toHaveAttribute('href', '/reader/book/e1');
    expect(screen.getByText('public.fitFree{}')).toBeInTheDocument();
  });

  it('Listen opens the player bar on this book; a free reader gets page 1, then Pro is offered in the reading column', async () => {
    useAuthStore.setState({ session: { user: { id: 'u' } } as never, isLoading: false });
    useSubscriptionStore.setState({ subscription: { tier: 'free' } as never, hasResolved: true, isLoading: false });
    open(1);
    // Offered once the page is on screen.
    await waitFor(() => expect(screen.getByRole('button', { name: 'listen.start' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'listen.start' }));
    expect(useListenStore.getState().source?.bookId).toBe('e1');
    expect(await screen.findByText('listen.proTitle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'listen.proCta' })).toHaveAttribute('href', '/subscription');
    // The toolbar is now the bar's play / pause switch.
    expect(screen.getByRole('button', { name: 'listen.listening' })).toBeInTheDocument();
  });

  it('a paragraph’s speaker plays the bar from that paragraph (free)', async () => {
    useAuthStore.setState({ session: { user: { id: 'u' } } as never, isLoading: false });
    useSubscriptionStore.setState({ subscription: { tier: 'free' } as never, hasResolved: true, isLoading: false });
    open(1);
    const speaker = await screen.findByRole('button', { name: 'listen.playFromHere' });
    fireEvent.click(speaker);
    expect(useListenStore.getState()).toMatchObject({ page: 1, index: 0 });
    expect(useListenStore.getState().source?.bookId).toBe('e1');
  });

  it('Listen asks a signed-out reader to sign in first', async () => {
    open(1);
    // Offered once the page is on screen.
    await waitFor(() => expect(screen.getByRole('button', { name: 'listen.start' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'listen.start' }));
    expect(await screen.findByText('listen.signInTitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /listen\.signInCta/ })).toBeInTheDocument();
  });

  it('the listen strip at the top of the page: a play button, what there is to hear, Space, and a one-time note', async () => {
    open(1);
    const play = await screen.findByRole('button', { name: 'listen.stripTitle' });
    expect(screen.getByText('listen.stripMeta{"count":1,"minutes":"1"}')).toBeInTheDocument();
    expect(screen.getByText('listen.space')).toBeInTheDocument();
    // The note shows once, and closes for good.
    expect(await screen.findByText('listen.hintNew')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'series.close' }));
    expect(screen.queryByText('listen.hintNew')).toBeNull();

    await waitFor(() => expect(play).toBeEnabled());
    fireEvent.click(play);
    expect(useListenStore.getState().source?.bookId).toBe('e1');
  });

  it('Space on the page starts listening when the bar is free', async () => {
    open(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'listen.stripTitle' })).toBeEnabled());
    fireEvent.keyDown(window, { key: ' ' });
    expect(useListenStore.getState().source?.bookId).toBe('e1');
  });
});
