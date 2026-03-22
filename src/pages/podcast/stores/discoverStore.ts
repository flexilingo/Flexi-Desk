import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { supabaseCall } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type {
  CuratedPodcast,
  PodcastIndexFeed,
  CuratedListResponse,
  TrendingResponse,
  FollowedPodcastsResponse,
  CefrLevel,
} from '../types';

const CATEGORIES = [
  'Education',
  'News',
  'Science',
  'Arts',
  'Society-Culture',
  'Technology',
] as const;

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

  // Follow in-progress
  followingFeedId: number | null;

  // Filtered/search results
  filterResults: (CuratedPodcast | PodcastIndexFeed)[];
  filterTotal: number;
  filterSource: 'db' | 'podcastindex' | null;
  isFilterLoading: boolean;

  // Browse section ("More" page)
  browseSectionSlug: string | null;
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
  followPodcast: (feedId: number) => Promise<void>;
  unfollowPodcast: (feedId: number) => Promise<void>;
  fetchAll: () => Promise<void>;

  // Filter actions
  fetchFilteredResults: (params: {
    search?: string;
    cefr?: CefrLevel;
    sort?: string;
    page?: number;
    limit?: number;
  }) => Promise<void>;

  // Browse section actions
  setBrowseSection: (slug: string) => void;
  clearBrowseSection: () => void;
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
    followingFeedId: null,
    filterResults: [],
    filterTotal: 0,
    filterSource: null,
    isFilterLoading: false,
    browseSectionSlug: null,
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
          s.trendingFeeds = res.feeds;
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
          s.categoryFeeds[cat] = res.feeds;
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
        set((s) => {
          s.followedPodcasts = res.podcasts;
          s.followedFeedIds = new Set(res.podcasts.map((p) => p.feed_id));
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
          s.starterPodcasts = res.podcasts;
          s.isStarterLoading = false;
        });
      } catch {
        set((s) => {
          s.isStarterLoading = false;
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

    fetchAll: async () => {
      const { fetchTrending, fetchFollowed, fetchCategory, fetchStarterPodcasts } = get();
      await Promise.allSettled([
        fetchTrending(),
        fetchFollowed(),
        fetchStarterPodcasts(),
        ...CATEGORIES.map((cat) => fetchCategory(cat)),
      ]);
    },

    fetchFilteredResults: async ({ search, cefr, sort = 'score', page = 1, limit = 18 }) => {
      set((s) => {
        s.isFilterLoading = true;
      });
      try {
        const params = new URLSearchParams({ action: 'curated-list' });
        if (search) params.set('search', search);
        if (cefr) params.set('cefr', cefr);
        if (sort) params.set('sort', sort);
        params.set('page', String(page));
        params.set('limit', String(limit));

        const res = await supabaseCall<CuratedListResponse>('GET', `/podcast?${params}`);
        set((s) => {
          s.filterResults = res.podcasts;
          s.filterTotal = res.total;
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

    setBrowseSection: (slug: string) => {
      set((s) => {
        s.browseSectionSlug = slug;
        s.browseSectionPage = 1;
        s.browseSectionItems = [];
        s.browseSectionTotal = 0;
      });
    },

    clearBrowseSection: () => {
      set((s) => {
        s.browseSectionSlug = null;
        s.browseSectionPage = 1;
        s.browseSectionItems = [];
        s.browseSectionTotal = 0;
      });
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
