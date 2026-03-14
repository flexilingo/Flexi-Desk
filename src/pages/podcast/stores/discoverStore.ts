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
} from '../types';

const CATEGORIES = ['Education', 'News', 'Science', 'Arts', 'Technology'] as const;

interface DiscoverState {
  // Curated (Analyzed by FlexiLingo)
  curatedPodcasts: CuratedPodcast[];
  isCuratedLoading: boolean;

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

  // Follow in-progress
  followingFeedId: number | null;

  // Error
  error: string | null;

  // Actions
  fetchCurated: () => Promise<void>;
  fetchTrending: () => Promise<void>;
  fetchCategory: (cat: string) => Promise<void>;
  fetchFollowed: () => Promise<void>;
  followPodcast: (feedId: number) => Promise<void>;
  unfollowPodcast: (feedId: number) => Promise<void>;
  fetchAll: () => Promise<void>;
  clearError: () => void;
}

export const useDiscoverStore = create<DiscoverState>()(
  immer((set, get) => ({
    curatedPodcasts: [],
    isCuratedLoading: false,
    trendingFeeds: [],
    isTrendingLoading: false,
    categoryFeeds: {},
    categoryLoading: {},
    followedPodcasts: [],
    isFollowedLoading: false,
    followedFeedIds: new Set(),
    followingFeedId: null,
    error: null,

    fetchCurated: async () => {
      set((s) => {
        s.isCuratedLoading = true;
      });
      try {
        const res = await supabaseCall<CuratedListResponse>(
          'GET',
          '/podcast?action=curated-list&sort=score&limit=15',
        );
        set((s) => {
          s.curatedPodcasts = res.podcasts;
          s.isCuratedLoading = false;
        });
      } catch (err) {
        set((s) => {
          s.isCuratedLoading = false;
          s.error = String(err);
        });
      }
    },

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
        // Refresh followed list
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
      const { fetchCurated, fetchTrending, fetchFollowed, fetchCategory } = get();
      // Fire all fetches in parallel
      await Promise.allSettled([
        fetchCurated(),
        fetchTrending(),
        fetchFollowed(),
        ...CATEGORIES.map((cat) => fetchCategory(cat)),
      ]);
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),
  })),
);

export { CATEGORIES };
