import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * The podcast hub renders ~10 independently-fetched sections. If any store field
 * that the render reads as an array is assigned `undefined` — which happens the
 * moment an endpoint answers 200 with a shape we didn't expect — the whole page
 * white-screens. Neither `vite build` (esbuild strips types, it never checks
 * them) nor eslint catches that.
 *
 * So: mount the real page with every cloud call answering `{}`, the worst
 * realistic response, and assert it still renders.
 */

// jsdom lacks both; the hub's horizontal rows and Radix popovers need them.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => []),
  convertFileSrc: (p: string) => p,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseCall: vi.fn(async () => ({})),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { PodcastPage } from '@/pages/podcast/components/PodcastPage';
import { useDiscoverStore } from '@/pages/podcast/stores/discoverStore';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/podcast/*" element={<PodcastPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('podcast page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the discovery hub even when every endpoint returns an empty object', () => {
    renderAt('/podcast');
    expect(screen.getByText('podcastUi:hubPageTitle')).toBeInTheDocument();
  });

  it('renders the library route', () => {
    expect(() => renderAt('/podcast/library')).not.toThrow();
  });

  it('never lets a malformed response turn a list into undefined', async () => {
    const store = useDiscoverStore.getState();
    await Promise.all([
      store.fetchTrending(),
      store.fetchStarterPodcasts(),
      store.fetchPopularPodcasts(),
      store.fetchPopularEpisodes(),
      store.fetchCuratedRow(),
      store.fetchFilteredResults({ search: 'x' }),
      store.searchPodcastIndex('x'),
    ]);

    const s = useDiscoverStore.getState();
    const lists = {
      trendingFeeds: s.trendingFeeds,
      starterPodcasts: s.starterPodcasts,
      popularPodcasts: s.popularPodcasts,
      popularEpisodes: s.popularEpisodes,
      curatedRow: s.curatedRow,
      filterResults: s.filterResults,
      piSearchResults: s.piSearchResults,
      episodesByLevel: s.episodesByLevel,
      historyEpisodes: s.historyEpisodes,
      followedPodcasts: s.followedPodcasts,
    };
    for (const [name, value] of Object.entries(lists)) {
      expect(Array.isArray(value), `${name} must stay an array`).toBe(true);
    }
    expect(typeof s.filterTotal).toBe('number');
  });
});
