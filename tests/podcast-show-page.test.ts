import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  EPISODES_PER_PAGE,
  clampPage,
  filterShowEpisodes,
  fold,
  formatEpisodeDuration,
  pageCount,
  pagerPages,
  podcastLanguageName,
  showLevelStats,
  showShareUrl,
  sliceAt,
  stripHtml,
} from '@/pages/podcast/utils/showEpisodes';
import type { CuratedEpisodeLite } from '@/pages/podcast/types';

const ep = (id: number, title: string, status = 'none'): CuratedEpisodeLite =>
  ({
    id: `c${id}`,
    episode_id: id,
    feed_id: 1,
    title,
    audio_url: 'a',
    image_url: null,
    publish_date: null,
    duration_seconds: 600,
    learning_score: null,
    cefr_level: null,
    speech_rate_wpm: null,
    status,
    video_id: null,
  }) as CuratedEpisodeLite;

describe('show page episode filters and pager', () => {
  const list = [ep(1, "L'éco en tête", 'ready'), ep(2, 'Cooking basics'), ep(3, 'Éco-anxiety', 'ready')];

  it('folds accents so "eco" finds "éco"', () => {
    expect(fold('Éco')).toBe('eco');
    expect(filterShowEpisodes(list, 'eco', false).map((e) => e.episode_id)).toEqual([1, 3]);
  });

  it('ready-only keeps transcribed episodes and combines with search', () => {
    expect(filterShowEpisodes(list, '', true).map((e) => e.episode_id)).toEqual([1, 3]);
    expect(filterShowEpisodes(list, 'cooking', true)).toEqual([]);
    expect(filterShowEpisodes(list, '  ', false)).toHaveLength(3);
  });

  it('pages 24 at a time and clamps a stale page to the last real one', () => {
    expect(EPISODES_PER_PAGE).toBe(24);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(24)).toBe(1);
    expect(pageCount(25)).toBe(2);
    expect(clampPage(99, 3)).toBe(3);
    expect(clampPage(NaN, 3)).toBe(1);
    expect(clampPage(0, 3)).toBe(1);
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(sliceAt(items, 3)).toEqual([48, 49]);
  });

  it('pager buttons: a window around the page with gaps', () => {
    expect(pagerPages(1, 4)).toEqual([1, 2, 3, 4]);
    expect(pagerPages(1, 10)).toEqual([1, 2, 3, 4, '…', 10]);
    expect(pagerPages(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]);
    expect(pagerPages(10, 10)).toEqual([1, '…', 7, 8, 9, 10]);
  });
});

describe('show page level and text helpers', () => {
  it('the most common transcribed level leads, else the show level', () => {
    expect(showLevelStats(['B1', 'B1', 'A2', null], null).showLevel).toBe('B1');
    expect(showLevelStats([], { cefr_level: 'a2' }).showLevel).toBe('A2');
    expect(showLevelStats([], { difficulty_band_low: 'B1', difficulty_band_high: 'B1' }).showLevel).toBe('B1');
    expect(showLevelStats([], { difficulty_band_low: 'A2', difficulty_band_high: 'B2' }).showLevel).toBeNull();
    expect(showLevelStats([], { cefr_level: 'unknown' }).showLevel).toBeNull();
  });

  it('strips feed markup and entities', () => {
    expect(stripHtml('<p>Tom &amp; Jerry</p><br/>It&#39;s &quot;fun&quot;')).toBe('Tom & Jerry\n\nIt\'s "fun"');
  });

  it('names the language in the reader\'s language and ignores junk', () => {
    expect(podcastLanguageName('en-US', 'en')).toBe('English');
    expect(podcastLanguageName('', 'en')).toBeNull();
    expect(podcastLanguageName('english language', 'en')).toBeNull();
  });

  it('formats durations and the public share url', () => {
    expect(formatEpisodeDuration(0, 'en')).toBeNull();
    expect(formatEpisodeDuration(3900, 'en')).toMatch(/1.*h.*5.*min/);
    expect(showShareUrl(433862, 'Celebrate Kids!', 'en')).toBe(
      'https://flexilingo.com/en/podcasts/433862-celebrate-kids',
    );
    expect(showShareUrl(7, '', 'fr')).toBe('https://flexilingo.com/fr/podcasts/7');
  });
});

const cloud = vi.hoisted(() => ({
  getPodcastDetail: vi.fn(),
  getPodcastEpisodes: vi.fn(),
  getCuratedEpisodes: vi.fn(),
}));
vi.mock('@/pages/podcast/services/podcastCloud', () => ({
  ...cloud,
  refreshUserEpisodes: vi.fn(),
  requestPodcast: vi.fn(),
  getMyRequests: vi.fn(),
}));

describe('show page store: older episodes', () => {
  beforeEach(() => vi.clearAllMocks());

  const rssEp = (id: number) => ({ id, feedId: 1, title: `rss ${id}`, datePublished: 1, duration: 60, enclosureUrl: 'x' });

  it('keeps curated episodes older than the index window and walks wider on request', async () => {
    const { usePodcastDetailStore } = await import('@/pages/podcast/stores/podcastDetailStore');
    cloud.getPodcastDetail.mockResolvedValue({ podcast: { id: 1, title: 'Show' } });
    const rss = Array.from({ length: 100 }, (_, i) => rssEp(i + 1));
    cloud.getPodcastEpisodes.mockResolvedValue({ episodes: rss });
    cloud.getCuratedEpisodes.mockResolvedValue({
      episodes: [ep(500, 'older curated', 'ready')],
      podcast: null,
      total: 1,
    });
    await usePodcastDetailStore.getState().load(1);
    let s = usePodcastDetailStore.getState();
    expect(s.episodes).toHaveLength(101);
    expect(s.hasMore).toBe(true);

    cloud.getPodcastEpisodes.mockResolvedValue({ episodes: [...rss, rssEp(101), rssEp(102)] });
    await s.loadOlder(1);
    s = usePodcastDetailStore.getState();
    expect(s.episodes).toHaveLength(103);
    expect(s.rssMax).toBe(300);
    // a short slice: that source is exhausted, so the walk ends
    expect(s.hasMore).toBe(false);
    expect(s.isFetchingMore).toBe(false);
  });
});
