import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  getPodcastDetail,
  getPodcastEpisodes,
  getCuratedEpisodes,
  refreshUserEpisodes,
  requestPodcast,
  getMyRequests,
} from '../services/podcastCloud';
import { useAuthStore } from '@/stores/authStore';
import type {
  CuratedEpisodeLite,
  CuratedPodcast,
  PodcastIndexEpisode,
  PodcastIndexFeed,
  PodcastRequest,
  RefreshUserEpisodesResponse,
} from '../types';

interface DetailState {
  feedId: number | null;
  /** PodcastIndex metadata — exists for every podcast. */
  podcast: PodcastIndexFeed | null;
  /** FlexiLingo curation row — null when the podcast isn't curated yet. */
  curated: CuratedPodcast | null;
  /** RSS episodes merged with their curated/analysis row (when one exists). */
  episodes: CuratedEpisodeLite[];
  isLoading: boolean;
  isEpisodesLoading: boolean;
  /** "Look through older episodes" is fetching a wider window. */
  isFetchingMore: boolean;
  /** How many episodes the curated source says the show holds (what we have transcribed). */
  curatedTotal: number;
  /** How wide the two episode requests are now; "older episodes" widens both. */
  rssMax: number;
  curatedLimit: number;
  /** The last request came back full, so another window probably exists behind it. */
  hasMore: boolean;
  notFound: boolean;
  error: string | null;

  isRefreshing: boolean;
  refreshResult: RefreshUserEpisodesResponse | null;

  isRequesting: boolean;
  myRequest: PodcastRequest | null;

  load: (feedId: number) => Promise<void>;
  loadOlder: (feedId: number) => Promise<void>;
  refreshEpisodes: (feedId: number) => Promise<void>;
  submitRequest: (feedId: number, message?: string) => Promise<void>;
  clearRefreshResult: () => void;
  clear: () => void;
}

/** PodcastIndex speaks camelCase and unix seconds; our UI speaks the curated shape. */
function normalizeRssEpisode(ep: PodcastIndexEpisode, feedId: number): CuratedEpisodeLite {
  return {
    id: `pi_${ep.id}`,
    episode_id: ep.id,
    feed_id: ep.feedId || feedId,
    title: ep.title,
    description: ep.description ?? null,
    audio_url: ep.enclosureUrl || null,
    image_url: ep.image || ep.feedImage || null,
    publish_date: ep.datePublished ? new Date(ep.datePublished * 1000).toISOString() : null,
    duration_seconds: ep.duration || null,
    learning_score: null,
    cefr_level: null,
    speech_rate_wpm: null,
    status: 'none',
    video_id: null,
  };
}

/**
 * Merges the RSS episode list (`episodes`) with FlexiLingo's analysis rows
 * (`curated-episodes`). RSS is the source of truth for *what exists*; curation
 * adds difficulty, transcription status, and the `video_id` / curated uuid the
 * cloud needs for progress tracking.
 */
function mergeEpisodes(
  rss: PodcastIndexEpisode[],
  curatedRows: CuratedEpisodeLite[],
  feedId: number,
): CuratedEpisodeLite[] {
  if (rss.length === 0) return curatedRows;

  const byEpisodeId = new Map<number, CuratedEpisodeLite>();
  const byTitle = new Map<string, CuratedEpisodeLite>();
  for (const c of curatedRows) {
    if (c.episode_id != null) byEpisodeId.set(c.episode_id, c);
    if (c.title) byTitle.set(c.title.trim().toLowerCase(), c);
  }

  const merged = rss.map((raw) => {
    const ep = normalizeRssEpisode(raw, feedId);
    const match = byEpisodeId.get(ep.episode_id) ?? byTitle.get(ep.title.trim().toLowerCase());
    if (!match) return ep;
    // Curation wins on analysis fields; RSS wins on playback fields.
    return {
      ...ep,
      ...match,
      title: ep.title || match.title,
      audio_url: ep.audio_url ?? match.audio_url,
      image_url: ep.image_url ?? match.image_url,
      duration_seconds: ep.duration_seconds ?? match.duration_seconds,
      publish_date: ep.publish_date ?? match.publish_date,
    };
  });

  // The index list is capped, curated data reaches further back: keep the curated episodes older than
  // the newest window too (index order first, curated tail appended), as the website does.
  const seen = new Set(merged.map((e) => e.episode_id));
  for (const c of curatedRows) if (!seen.has(c.episode_id)) merged.push(c);
  return merged;
}

const RSS_WINDOW = 100;
const CURATED_WINDOW = 500;

export const usePodcastDetailStore = create<DetailState>()(
  immer((set, get) => ({
    feedId: null,
    podcast: null,
    curated: null,
    episodes: [],
    isLoading: false,
    isEpisodesLoading: false,
    isFetchingMore: false,
    curatedTotal: 0,
    rssMax: RSS_WINDOW,
    curatedLimit: CURATED_WINDOW,
    hasMore: false,
    notFound: false,
    error: null,
    isRefreshing: false,
    refreshResult: null,
    isRequesting: false,
    myRequest: null,

    load: async (feedId: number) => {
      set((s) => {
        s.feedId = feedId;
        s.isLoading = true;
        s.isEpisodesLoading = true;
        s.notFound = false;
        s.error = null;
        s.podcast = null;
        s.curated = null;
        s.episodes = [];
        s.curatedTotal = 0;
        s.rssMax = RSS_WINDOW;
        s.curatedLimit = CURATED_WINDOW;
        s.hasMore = false;
        s.isFetchingMore = false;
        s.refreshResult = null;
        s.myRequest = null;
      });

      // Detail decides found/not-found; the rest are enrichments that must not
      // take the page down if they fail.
      try {
        const { podcast } = await getPodcastDetail(feedId);
        if (get().feedId !== feedId) return;
        set((s) => {
          s.podcast = podcast ?? null;
          s.notFound = !podcast;
          s.isLoading = false;
        });
      } catch (e) {
        if (get().feedId !== feedId) return;
        set((s) => {
          s.isLoading = false;
          s.isEpisodesLoading = false;
          s.notFound = true;
          s.error = String(e);
        });
        return;
      }

      const [rssRes, curatedRes] = await Promise.allSettled([
        getPodcastEpisodes(feedId, RSS_WINDOW),
        getCuratedEpisodes(feedId, { status: 'all', limit: CURATED_WINDOW }),
      ]);
      if (get().feedId !== feedId) return;

      const rss = rssRes.status === 'fulfilled' ? (rssRes.value.episodes ?? []) : [];
      const curatedRows =
        curatedRes.status === 'fulfilled' ? (curatedRes.value.episodes ?? []) : [];
      const curatedPodcast =
        curatedRes.status === 'fulfilled' ? (curatedRes.value.podcast ?? null) : null;

      set((s) => {
        s.curated = curatedPodcast;
        s.episodes = mergeEpisodes(rss, curatedRows, feedId);
        s.curatedTotal = curatedRes.status === 'fulfilled' ? (curatedRes.value.total ?? 0) : 0;
        s.hasMore = rss.length >= RSS_WINDOW || curatedRows.length >= CURATED_WINDOW;
        s.isEpisodesLoading = false;
        if (rssRes.status === 'rejected' && curatedRes.status === 'rejected') {
          s.error = String(rssRes.reason);
        }
      });

      if (useAuthStore.getState().session && !curatedPodcast) {
        try {
          const { requests } = await getMyRequests(1, 50);
          if (get().feedId !== feedId) return;
          set((s) => {
            s.myRequest = requests.find((r) => r.feed_id === feedId) ?? null;
          });
        } catch {
          // A missing request status just hides the badge.
        }
      }
    },

    /** "Look through older episodes": asks both sources for a wider window. */
    loadOlder: async (feedId: number) => {
      if (get().feedId !== feedId || get().isFetchingMore) return;
      const rssMax = get().rssMax + RSS_WINDOW * 2;
      const curatedLimit = get().curatedLimit + CURATED_WINDOW;
      set((s) => {
        s.isFetchingMore = true;
      });
      const [rssRes, curatedRes] = await Promise.allSettled([
        getPodcastEpisodes(feedId, rssMax),
        getCuratedEpisodes(feedId, { status: 'all', limit: curatedLimit }),
      ]);
      if (get().feedId !== feedId) return;
      const rss = rssRes.status === 'fulfilled' ? (rssRes.value.episodes ?? []) : [];
      const curatedRows =
        curatedRes.status === 'fulfilled' ? (curatedRes.value.episodes ?? []) : [];
      set((s) => {
        s.isFetchingMore = false;
        if (rssRes.status === 'rejected' && curatedRes.status === 'rejected') {
          s.error = String(rssRes.reason);
          return;
        }
        const before = s.episodes.length;
        const merged = mergeEpisodes(rss, curatedRows, feedId);
        s.rssMax = rssMax;
        s.curatedLimit = curatedLimit;
        s.episodes = merged;
        // A short slice means that source is exhausted; a window that added nothing ends the walk.
        s.hasMore =
          merged.length > before && (rss.length >= rssMax || curatedRows.length >= curatedLimit);
      });
    },

    /** Pulls the podcast's RSS again server-side and enqueues new episodes. */
    refreshEpisodes: async (feedId: number) => {
      set((s) => {
        s.isRefreshing = true;
        s.refreshResult = null;
        s.error = null;
      });
      try {
        const res = await refreshUserEpisodes(feedId);
        set((s) => {
          s.isRefreshing = false;
          s.refreshResult = res;
        });
        if (res.discovered > 0) await get().load(feedId);
      } catch (e) {
        set((s) => {
          s.isRefreshing = false;
          s.error = String(e);
        });
      }
    },

    submitRequest: async (feedId: number, message?: string) => {
      set((s) => {
        s.isRequesting = true;
        s.error = null;
      });
      try {
        await requestPodcast(feedId, message);
        set((s) => {
          s.isRequesting = false;
          s.myRequest = {
            id: 'pending',
            feed_id: feedId,
            title: s.podcast?.title ?? null,
            author: s.podcast?.author ?? null,
            image_url: s.podcast?.image ?? null,
            message: message ?? null,
            status: 'pending',
            admin_notes: null,
            created_at: new Date().toISOString(),
          };
        });
      } catch (e) {
        set((s) => {
          s.isRequesting = false;
          s.error = String(e);
        });
        throw e; // let the dialog stay open on failure
      }
    },

    clearRefreshResult: () =>
      set((s) => {
        s.refreshResult = null;
      }),

    clear: () =>
      set((s) => {
        s.feedId = null;
        s.podcast = null;
        s.curated = null;
        s.episodes = [];
        s.curatedTotal = 0;
        s.hasMore = false;
        s.isFetchingMore = false;
        s.notFound = false;
        s.error = null;
        s.refreshResult = null;
        s.myRequest = null;
      }),
  })),
);
