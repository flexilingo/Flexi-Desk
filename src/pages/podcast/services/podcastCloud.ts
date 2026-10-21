// =============================================================================
// Podcast cloud API — one typed wrapper per `/podcast?action=…` Edge Function call.
// =============================================================================
// Mirrors flexi-lingo-front's `src/store/podcastApi.ts` surface. Everything goes
// through `supabaseCall()` → Rust (never `fetch()` from JS, per CLAUDE.md).
//
// NOTE ON GATING: `?action=all-episodes` is ADMIN-ONLY (auth + requireAdmin →
// 403). It must never be called from the desktop client. The public equivalent
// for "recently analyzed episodes" is `browse-episodes`.
// =============================================================================

import { supabaseCall } from '@/lib/supabase';
import type {
  AllEpisodesResponse,
  BrowseEpisodesParams,
  CuratedEpisodesResponse,
  CuratedListResponse,
  EpisodeMetadata,
  EpisodesByLevelParams,
  EpisodesByLevelResponse,
  FollowedPodcast,
  MyPodcastsResponse,
  PodcastDetailResponse,
  PodcastEpisodesResponse,
  PodcastIndexFeed,
  PodcastRequest,
  PopularEpisodesResponse,
  PopularPodcastsResponse,
  PublicStats,
  RefreshUserEpisodesResponse,
  TrendingResponse,
} from '../types';

const qs = (params: Record<string, string | number | undefined | null>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  return sp.toString();
};

// ─── Discovery (public) ──────────────────────────────────────────────────────

/** PodcastIndex full-text discovery — finds podcasts outside the curated catalog. */
export const searchPodcasts = (q: string, language?: string, max = 20) =>
  supabaseCall<{ feeds: PodcastIndexFeed[]; count: number }>(
    'GET',
    `/podcast?${qs({ action: 'search', q, language, max })}`,
  );

export const getTrending = (max = 15, cat?: string, lang?: string) =>
  supabaseCall<TrendingResponse>('GET', `/podcast?${qs({ action: 'trending', max, cat, lang })}`);

export const getStarterPodcasts = (lang?: string) =>
  supabaseCall<CuratedListResponse>('GET', `/podcast?${qs({ action: 'starter-podcasts', lang })}`);

export const getPopularPodcasts = (limit = 12, days?: number) =>
  supabaseCall<PopularPodcastsResponse>(
    'GET',
    `/podcast?${qs({ action: 'popular-podcasts', limit, days })}`,
  );

export const getPopularEpisodes = (limit = 6, days?: number) =>
  supabaseCall<PopularEpisodesResponse>(
    'GET',
    `/podcast?${qs({ action: 'popular-episodes', limit, days })}`,
  );

export const getPublicStats = () =>
  supabaseCall<PublicStats>('GET', '/podcast?action=public-stats');

// ─── Curated catalog + v2 difficulty ─────────────────────────────────────────

export const getCuratedList = (params: {
  difficulty?: string;
  topic?: string;
  language?: string;
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}) =>
  supabaseCall<CuratedListResponse>('GET', `/podcast?${qs({ action: 'curated-list', ...params })}`);

export const getCuratedEpisodes = (
  feedId: number,
  params: {
    sort?: string;
    page?: number;
    limit?: number;
    status?: string;
    difficulty?: string;
  } = {},
) =>
  supabaseCall<CuratedEpisodesResponse>(
    'GET',
    `/podcast?${qs({ action: 'curated-episodes', feed_id: feedId, status: 'all', ...params })}`,
  );

/** Public cross-feed browse of ready episodes. Replaces the admin-only `all-episodes`. */
export const browseEpisodes = (params: BrowseEpisodesParams = {}) =>
  supabaseCall<AllEpisodesResponse>(
    'GET',
    `/podcast?${qs({ action: 'browse-episodes', ...params })}`,
  );

/** v2 per-episode difficulty browse — the real "study at my level" surface. */
export const getEpisodesByLevel = (params: EpisodesByLevelParams) =>
  supabaseCall<EpisodesByLevelResponse>(
    'GET',
    `/podcast?${qs({
      action: 'episodes-by-level',
      level: params.level,
      max_score: params.maxScore,
      language: params.language ?? 'en',
      topic: params.topic,
      search: params.search,
      sort: params.sort,
      page: params.page ?? 1,
      limit: params.limit ?? 24,
    })}`,
  );

/** Single episode. The ONLY source of `podcast_language`. */
export const getEpisodeMetadata = (videoId: string) =>
  supabaseCall<{ episode: EpisodeMetadata }>(
    'GET',
    `/podcast?${qs({ action: 'get-episode', video_id: videoId })}`,
  );

// ─── PodcastIndex live lookups ───────────────────────────────────────────────

export const getPodcastDetail = (feedId: number) =>
  supabaseCall<PodcastDetailResponse>(
    'GET',
    `/podcast?${qs({ action: 'detail', feed_id: feedId })}`,
  );

export const getPodcastEpisodes = (feedId: number, max = 200) =>
  supabaseCall<PodcastEpisodesResponse>(
    'GET',
    `/podcast?${qs({ action: 'episodes', feed_id: feedId, max })}`,
  );

// ─── Follow / subscription (auth) ────────────────────────────────────────────

export const followPodcast = (feedId: number) =>
  supabaseCall<{ success: boolean; episodes_discovered?: number }>(
    'POST',
    '/podcast?action=follow-podcast',
    {
      feed_id: feedId,
    },
  );

export const unfollowPodcast = (feedId: number) =>
  supabaseCall<{ success: boolean }>('POST', '/podcast?action=unfollow-podcast', {
    feed_id: feedId,
  });

export const getMyFollowedPodcasts = () =>
  supabaseCall<{ podcasts: FollowedPodcast[] }>('GET', '/podcast?action=my-followed-podcasts');

export const updateFollowSettings = (feedId: number, autoTranscribe: boolean) =>
  supabaseCall<{ success: boolean }>('POST', '/podcast?action=update-follow-settings', {
    feed_id: feedId,
    auto_transcribe: autoTranscribe,
  });

export const refreshUserEpisodes = (feedId: number) =>
  supabaseCall<RefreshUserEpisodesResponse>('POST', '/podcast?action=refresh-user-episodes', {
    feed_id: feedId,
  });

// ─── Progress / history (auth) ───────────────────────────────────────────────

/**
 * `episode_id` is the `curated_episodes.id` UUID — NOT desk's local episode id.
 * Episodes that were never curated have no UUID and must skip this call.
 */
export const updateEpisodeActivity = (
  curatedEpisodeId: string,
  progressSeconds: number,
  completed?: boolean,
) =>
  supabaseCall<{ success: boolean }>('POST', '/podcast?action=update-episode-activity', {
    episode_id: curatedEpisodeId,
    progress: Math.round(progressSeconds),
    ...(completed ? { completed: true } : {}),
  });

export const getMyPodcasts = () =>
  supabaseCall<MyPodcastsResponse>('GET', '/podcast?action=my-podcasts');

// ─── Requests (auth) ─────────────────────────────────────────────────────────

export const requestPodcast = (feedId: number, message?: string) =>
  supabaseCall<{ success: boolean }>('POST', '/podcast?action=request-podcast', {
    feed_id: feedId,
    ...(message ? { message } : {}),
  });

export const getMyRequests = (page = 1, limit = 20) =>
  supabaseCall<{ requests: PodcastRequest[]; total: number }>(
    'GET',
    `/podcast?${qs({ action: 'my-requests', page, limit })}`,
  );
