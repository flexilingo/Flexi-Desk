// Account-side podcast calls the website uses for "Saved episodes", listening history and the
// "what Jev decided" insights. Same actions as flexi-lingo-front's podcastApi.

import { supabaseCall } from '@/lib/supabase';

/** One saved episode, joined with its current catalogue detail (`my-favorite-episodes`). */
export interface FavoriteEpisode {
  id: string;
  videoId: string;
  createdAt: string;
  /** false = the episode left the catalogue after it was saved. */
  available: boolean;
  podcastTitle: string | null;
  /** Only a 'ready' episode has a transcript to play against. */
  status: string | null;
  feedId: number | null;
  title: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishDate: string | null;
  cefrLevel: string | null;
  difficultyBand: string | null;
  learningScore: number | null;
}

/** One row of the account's listening history (`my-listening-history`). */
export interface HistoryEpisode {
  id: string;
  episode_id: number;
  feed_id: number;
  video_id: string | null;
  title: string;
  audio_url: string | null;
  image_url: string | null;
  duration_seconds: number | null;
  status: string;
  difficulty_score: number | null;
  difficulty_band: string | null;
  cefr_level: string | null;
  podcast_title: string | null;
  podcast_image: string | null;
  /** Seconds listened up to; the player resumes there. */
  listen_progress_seconds: number;
  is_completed: boolean;
  completed_at: string | null;
  last_played_at: string;
}

export const toggleFavoriteEpisode = (videoId: string) =>
  supabaseCall<{ success: boolean; isFavorite: boolean }>(
    'POST',
    '/podcast?action=toggle-favorite-episode',
    { video_id: videoId },
  );

export const getMyFavoriteEpisodes = (limit = 50, offset = 0) =>
  supabaseCall<{ favorites: FavoriteEpisode[]; hasMore: boolean }>(
    'GET',
    `/podcast?action=my-favorite-episodes&limit=${limit}&offset=${offset}`,
  );

export const isEpisodeFavorite = (videoId: string) =>
  supabaseCall<{ isFavorite: boolean }>(
    'GET',
    `/podcast?action=my-favorite-episodes&video_id=${encodeURIComponent(videoId)}`,
  );

export const getMyListeningHistory = (limit = 50) =>
  supabaseCall<{ history: HistoryEpisode[] }>(
    'GET',
    `/podcast?action=my-listening-history&limit=${limit}`,
  );

/** What the pipeline decided about an episode (`episode-insights`); `pending` until it has an answer. */
export interface EpisodeInsights {
  status?: string;
  [key: string]: unknown;
}

export const getEpisodeInsights = (videoId: string) =>
  supabaseCall<EpisodeInsights>(
    'GET',
    `/podcast?action=episode-insights&video_id=${encodeURIComponent(videoId)}`,
  );
