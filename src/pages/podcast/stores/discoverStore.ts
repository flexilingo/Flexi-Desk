import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { supabaseCall } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  browseEpisodes,
  getEpisodesByLevel,
  getMyPodcasts,
  getPublicStats,
  searchPodcasts,
  updateFollowSettings,
} from '../services/podcastCloud';
import type {
  CuratedPodcast,
  PodcastIndexFeed,
  CuratedListResponse,
  TrendingResponse,
  FollowedPodcastsResponse,
  PopularPodcastsResponse,
  PopularEpisodesResponse,
  CuratedEpisodeLite,
  CefrLevel,
  EpisodeByLevel,
  PublicStats,
  TopicCategory,
} from '../types';

const CATEGORIES = [
  'Education',
  'News',
  'Science',
  'Arts',
  'Society-Culture',
  'Technology',
] as const;

export type LevelSort = 'easiest' | 'hardest' | 'newest';

/** Mirrors what `?action=episodes-by-level` accepts. */
export interface EpisodeFilterParams {
  level?: CefrLevel;
  topic?: TopicCategory;
  search?: string;
  language?: string;
  sort?: LevelSort;
  page?: number;
  limit?: number;
}

/**
 * The filter pills fire a request per click, and `episodes-by-level` responses can
 * land out of order. Only the newest request is allowed to write to the store.
 */
let levelRequestId = 0;
let piSearchRequestId = 0;

interface DiscoverState {
  // Trending
  trendingFeeds: PodcastIndexFeed[];
  isTrendingLoading: boolean;

  // Category rows
  categoryFeeds: Record<string, PodcastIndexFeed[]>;
  categoryLoading: Record<string, boolean>;

  // Followed podcasts (cloud)
  followedPodcasts: (CuratedPodcast & { auto_transcribe: boolean; followed_at: string })[];
  isFollowedLoading: boolean;
  followedFeedIds: Set<number>;

  // Starter podcasts (top language learning, for new users)
  starterPodcasts: PodcastIndexFeed[];
  isStarterLoading: boolean;

  // Popular podcasts (by real listen data)
  popularPodcasts: (CuratedPodcast & { listener_count: number; follow_count: number })[];
  isPopularLoading: boolean;

  // Popular episodes ("Hot This Week")
  popularEpisodes: CuratedEpisodeLite[];
  isPopularEpisodesLoading: boolean;

  // Newest analyzed episodes ("Just Analyzed")
  newEpisodes: CuratedEpisodeLite[];
  isNewEpisodesLoading: boolean;

  // v2 per-episode difficulty — a podcast is not uniformly one CEFR level, so the
  // hub browses EPISODES by band/score. (Replaced the feed-level `smartPicks`.)
  episodesByLevel: EpisodeByLevel[];
  episodesByLevelTotal: number;
  isEpisodesByLevelLoading: boolean;
  publicStats: PublicStats | null;

  // Curated row for discovery
  curatedRow: CuratedPodcast[];
  isCuratedRowLoading: boolean;

  // Listening history (cloud) — episodes this account has played anywhere
  historyEpisodes: CuratedEpisodeLite[];
  isHistoryLoading: boolean;

  // Follow in-progress
  followingFeedId: number | null;
  // Feed whose auto-transcribe toggle is mid-flight
  updatingFollowFeedId: number | null;

  // PodcastIndex full-text search ("Discover more") — podcasts outside the catalog
  piSearchResults: PodcastIndexFeed[];
  isPiSearchLoading: boolean;

  // Filtered/search results
  filterResults: (CuratedPodcast | PodcastIndexFeed)[];
  filterTotal: number;
  filterSource: 'db' | 'podcastindex' | null;
  isFilterLoading: boolean;
  // Browse section ("More" page) — the slug lives in the URL, not here.
  browseSectionPage: number;
  browseSectionItems: PodcastIndexFeed[];
  browseSectionTotal: number;
  browseSectionLoading: boolean;

  // Error
  error: string | null;

  // Actions
  fetchTrending: () => Promise<void>;
  fetchCategory: (cat: string) => Promise<void>;
  fetchFollowed: () => Promise<void>;
  fetchStarterPodcasts: () => Promise<void>;
  fetchPopularPodcasts: () => Promise<void>;
  fetchPopularEpisodes: () => Promise<void>;
  fetchNewEpisodes: () => Promise<void>;
  fetchEpisodesByLevel: (params: EpisodeFilterParams) => Promise<void>;
  fetchPublicStats: () => Promise<void>;
  fetchCuratedRow: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  followPodcast: (feedId: number) => Promise<void>;
  unfollowPodcast: (feedId: number) => Promise<void>;
  setAutoTranscribe: (feedId: number, autoTranscribe: boolean) => Promise<void>;
  fetchAll: () => Promise<void>;

  // Filter actions
  fetchFilteredResults: (params: {
    search?: string;
    cefr?: CefrLevel;
    topic?: TopicCategory;
    language?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }) => Promise<void>;

  searchPodcastIndex: (q: string, language?: string, max?: number) => Promise<void>;

  // Browse section actions
  fetchBrowseSection: (slug: string, page: number) => Promise<void>;

  clearError: () => void;
}

export const useDiscoverStore = create<DiscoverState>()(
  immer((set, get) => ({
    trendingFeeds: [],
    isTrendingLoading: false,
    categoryFeeds: {},
    categoryLoading: {},
    followedPodcasts: [],
    isFollowedLoading: false,
    followedFeedIds: new Set(),
    starterPodcasts: [],
    isStarterLoading: false,
    popularPodcasts: [],
    isPopularLoading: false,
    popularEpisodes: [],
    isPopularEpisodesLoading: false,
    newEpisodes: [],
    isNewEpisodesLoading: false,
    episodesByLevel: [],
    episodesByLevelTotal: 0,
    isEpisodesByLevelLoading: false,
    publicStats: null,
    curatedRow: [],
    isCuratedRowLoading: false,
    historyEpisodes: [],
    isHistoryLoading: false,
    followingFeedId: null,
    updatingFollowFeedId: null,
    piSearchResults: [],
    isPiSearchLoading: false,
    filterResults: [],
    filterTotal: 0,
    filterSource: null,
    isFilterLoading: false,
    browseSectionPage: 1,
    browseSectionItems: [],
    browseSectionTotal: 0,
    browseSectionLoading: false,
    error: null,

    fetchTrending: async () => {
      set((s) => {
        s.isTrendingLoading = true;
      });
      try {
        const res = await supabaseCall<TrendingResponse>('GET', '/podcast?action=trending&max=15');
        set((s) => {
          s.trendingFeeds = res.feeds ?? [];
          s.isTrendingLoading = false;
        });
      } catch (err) {
        set((s) => {
          s.isTrendingLoading = false;
          s.error = String(err);
        });
      }
    },

    fetchCategory: async (cat: string) => {
      set((s) => {
        s.categoryLoading[cat] = true;
      });
      try {
        const res = await supabaseCall<TrendingResponse>(
          'GET',
          `/podcast?action=trending&max=15&cat=${encodeURIComponent(cat)}`,
        );
        set((s) => {
          s.categoryFeeds[cat] = res.feeds ?? [];
          s.categoryLoading[cat] = false;
        });
      } catch (err) {
        set((s) => {
          s.categoryLoading[cat] = false;
          s.error = String(err);
        });
      }
    },

    fetchFollowed: async () => {
      const session = useAuthStore.getState().session;
      if (!session) return;

      set((s) => {
        s.isFollowedLoading = true;
      });
      try {
        const res = await supabaseCall<FollowedPodcastsResponse>(
          'GET',
          '/podcast?action=my-followed-podcasts',
        );
        const podcasts = res.podcasts ?? [];
        set((s) => {
          s.followedPodcasts = podcasts;
          s.followedFeedIds = new Set(podcasts.map((p) => p.feed_id));
          s.isFollowedLoading = false;
        });
      } catch (err) {
        set((s) => {
          s.isFollowedLoading = false;
          s.error = String(err);
        });
      }
    },

    fetchStarterPodcasts: async () => {
      set((s) => {
        s.isStarterLoading = true;
      });
      try {
        const res = await supabaseCall<{ podcasts: PodcastIndexFeed[] }>(
          'GET',
          '/podcast?action=starter-podcasts',
        );
        set((s) => {
          s.starterPodcasts = res.podcasts ?? [];
          s.isStarterLoading = false;
        });
      } catch {
        set((s) => {
          s.isStarterLoading = false;
        });
      }
    },

    fetchPopularPodcasts: async () => {
      set((s) => {
        s.isPopularLoading = true;
      });
      try {
        const res = await supabaseCall<PopularPodcastsResponse>(
          'GET',
          '/podcast?action=popular-podcasts&limit=12&days=7',
        );
        set((s) => {
          s.popularPodcasts = res.podcasts ?? [];
          s.isPopularLoading = false;
        });
      } catch {
        set((s) => {
          s.isPopularLoading = false;
        });
      }
    },

    fetchPopularEpisodes: async () => {
      set((s) => {
        s.isPopularEpisodesLoading = true;
      });
      try {
        const res = await supabaseCall<PopularEpisodesResponse>(
          'GET',
          '/podcast?action=popular-episodes&limit=6&days=7',
        );
        set((s) => {
          s.popularEpisodes = res.episodes ?? [];
          s.isPopularEpisodesLoading = false;
        });
      } catch {
        set((s) => {
          s.isPopularEpisodesLoading = false;
        });
      }
    },

    // Uses the PUBLIC `browse-episodes`. The previous `all-episodes` action is
    // admin-only (auth + requireAdmin → 403), so this row silently failed for
    // every normal user.
    fetchNewEpisodes: async () => {
      set((s) => {
        s.isNewEpisodesLoading = true;
      });
      try {
        const res = await browseEpisodes({ sort: 'newest', page: 1, limit: 6 });
        set((s) => {
          s.newEpisodes = res.episodes ?? [];
          s.isNewEpisodesLoading = false;
        });
      } catch (e) {
        set((s) => {
          s.newEpisodes = [];
          s.isNewEpisodesLoading = false;
          s.error = String(e);
        });
      }
    },

    // v2 per-episode difficulty. A podcast is not uniformly one CEFR level, so we
    // browse EPISODES by band/score rather than whole feeds. This replaced the
    // legacy `curated-list&cefr=` "smart picks" row.
    fetchEpisodesByLevel: async (params: EpisodeFilterParams) => {
      // The endpoint 400s unless at least one of level/topic/search/max_score is
      // present, so never fire a bare request.
      if (!params.level && !params.topic && !params.search) {
        set((s) => {
          s.episodesByLevel = [];
          s.episodesByLevelTotal = 0;
          s.isEpisodesByLevelLoading = false;
        });
        return;
      }

      const reqId = ++levelRequestId;
      set((s) => {
        s.isEpisodesByLevelLoading = true;
      });
      try {
        const res = await getEpisodesByLevel({
          sort: 'easiest',
          page: 1,
          limit: 24,
          ...params,
        });
        if (reqId !== levelRequestId) return; // a newer filter won
        set((s) => {
          s.episodesByLevel = res.episodes ?? [];
          s.episodesByLevelTotal = res.total ?? 0;
          s.isEpisodesByLevelLoading = false;
        });
      } catch (e) {
        if (reqId !== levelRequestId) return;
        set((s) => {
          s.episodesByLevel = [];
          s.episodesByLevelTotal = 0;
          s.isEpisodesByLevelLoading = false;
          s.error = String(e);
        });
      }
    },

    fetchPublicStats: async () => {
      try {
        const stats = await getPublicStats();
        set((s) => {
          s.publicStats = stats;
        });
      } catch {
        // Stats are decorative — a failure must never block the hub.
      }
    },

    fetchCuratedRow: async () => {
      set((s) => {
        s.isCuratedRowLoading = true;
      });
      try {
        const res = await supabaseCall<CuratedListResponse>(
          'GET',
          '/podcast?action=curated-list&sort=score&page=1&limit=12',
        );
        set((s) => {
          s.curatedRow = res.podcasts ?? [];
          s.isCuratedRowLoading = false;
        });
      } catch {
        set((s) => {
          s.isCuratedRowLoading = false;
        });
      }
    },

    followPodcast: async (feedId: number) => {
      set((s) => {
        s.followingFeedId = feedId;
      });
      try {
        await supabaseCall('POST', '/podcast?action=follow-podcast', { feed_id: feedId });
        set((s) => {
          s.followedFeedIds.add(feedId);
          s.followingFeedId = null;
        });
        get().fetchFollowed();
      } catch (err) {
        set((s) => {
          s.followingFeedId = null;
          s.error = String(err);
        });
      }
    },

    unfollowPodcast: async (feedId: number) => {
      set((s) => {
        s.followingFeedId = feedId;
      });
      try {
        await supabaseCall('POST', '/podcast?action=unfollow-podcast', { feed_id: feedId });
        set((s) => {
          s.followedFeedIds.delete(feedId);
          s.followedPodcasts = s.followedPodcasts.filter((p) => p.feed_id !== feedId);
          s.followingFeedId = null;
        });
      } catch (err) {
        set((s) => {
          s.followingFeedId = null;
          s.error = String(err);
        });
      }
    },

    /** Auto-transcribe: the cloud pre-transcribes new episodes of a followed podcast. */
    setAutoTranscribe: async (feedId: number, autoTranscribe: boolean) => {
      set((s) => {
        s.updatingFollowFeedId = feedId;
      });
      try {
        await updateFollowSettings(feedId, autoTranscribe);
        set((s) => {
          const p = s.followedPodcasts.find((x) => x.feed_id === feedId);
          if (p) p.auto_transcribe = autoTranscribe;
          s.updatingFollowFeedId = null;
        });
      } catch (err) {
        set((s) => {
          s.updatingFollowFeedId = null;
          s.error = String(err);
        });
      }
    },

    /** Cloud listening history — what this account played, on any device. */
    fetchHistory: async () => {
      if (!useAuthStore.getState().session) return;
      set((s) => {
        s.isHistoryLoading = true;
      });
      try {
        const res = await getMyPodcasts();
        set((s) => {
          s.historyEpisodes = res.episodes ?? [];
          s.isHistoryLoading = false;
        });
      } catch (err) {
        set((s) => {
          s.isHistoryLoading = false;
          s.error = String(err);
        });
      }
    },

    fetchAll: async () => {
      const {
        fetchTrending,
        fetchFollowed,
        fetchCategory,
        fetchStarterPodcasts,
        fetchPopularPodcasts,
        fetchPopularEpisodes,
        fetchNewEpisodes,
        fetchPublicStats,
        fetchCuratedRow,
      } = get();
      await Promise.allSettled([
        fetchTrending(),
        fetchFollowed(),
        fetchStarterPodcasts(),
        fetchPopularPodcasts(),
        fetchPopularEpisodes(),
        fetchNewEpisodes(),
        fetchPublicStats(),
        fetchCuratedRow(),
        ...CATEGORIES.map((cat) => fetchCategory(cat)),
      ]);
    },

    /** PodcastIndex discovery. Failures are non-fatal — the curated results still show. */
    searchPodcastIndex: async (q: string, language?: string, max = 20) => {
      const reqId = ++piSearchRequestId;
      set((s) => {
        s.isPiSearchLoading = true;
      });
      try {
        const res = await searchPodcasts(q, language, max);
        if (reqId !== piSearchRequestId) return;
        set((s) => {
          s.piSearchResults = res.feeds ?? [];
          s.isPiSearchLoading = false;
        });
      } catch {
        if (reqId !== piSearchRequestId) return;
        set((s) => {
          s.piSearchResults = [];
          s.isPiSearchLoading = false;
        });
      }
    },

    fetchFilteredResults: async ({
      search,
      cefr,
      topic,
      language,
      sort = 'score',
      page = 1,
      limit = 24,
    }) => {
      set((s) => {
        s.isFilterLoading = true;
      });
      try {
        const params = new URLSearchParams({ action: 'curated-list' });
        if (search) params.set('search', search);
        if (cefr) params.set('cefr', cefr);
        if (topic) params.set('topic', topic);
        if (language) params.set('language', language);
        if (sort) params.set('sort', sort);
        params.set('page', String(page));
        params.set('limit', String(limit));

        const res = await supabaseCall<CuratedListResponse>('GET', `/podcast?${params}`);
        set((s) => {
          s.filterResults = res.podcasts ?? [];
          s.filterTotal = res.total ?? 0;
          s.filterSource = res.source ?? 'db';
          s.isFilterLoading = false;
        });
      } catch (err) {
        set((s) => {
          s.isFilterLoading = false;
          s.error = String(err);
        });
      }
    },

    fetchBrowseSection: async (slug: string, page: number) => {
      const PAGE_SIZE = 24;
      set((s) => {
        s.browseSectionLoading = true;
        s.browseSectionPage = page;
      });

      try {
        // Map slug to category param
        const catMap: Record<string, string> = {
          education: 'Education',
          news: 'News',
          arts: 'Arts',
          science: 'Science',
          society: 'Society-Culture',
          technology: 'Technology',
        };

        if (slug === 'trending' || catMap[slug]) {
          const max = page * PAGE_SIZE;
          const catParam = catMap[slug] ? `&cat=${encodeURIComponent(catMap[slug])}` : '';
          const res = await supabaseCall<TrendingResponse>(
            'GET',
            `/podcast?action=trending&max=${max}${catParam}`,
          );
          const allFeeds = res.feeds ?? [];
          const pageFeeds = allFeeds.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
          set((s) => {
            s.browseSectionItems = pageFeeds;
            s.browseSectionTotal = res.count ?? allFeeds.length;
            s.browseSectionLoading = false;
          });
        } else if (slug === 'followed') {
          // Use existing followed data, paginate client-side
          const all = get().followedPodcasts;
          set((s) => {
            s.browseSectionItems = [];
            s.browseSectionTotal = all.length;
            s.browseSectionLoading = false;
          });
        } else {
          set((s) => {
            s.browseSectionLoading = false;
          });
        }
      } catch (err) {
        set((s) => {
          s.browseSectionLoading = false;
          s.error = String(err);
        });
      }
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),
  })),
);

export { CATEGORIES };
