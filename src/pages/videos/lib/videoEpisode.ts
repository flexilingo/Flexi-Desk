// Turns a catalogue video into a LOCAL episode the shared player can run on. Notes, the sentence chat
// and word history all key on a local episode row, so the video is imported as one (idempotently —
// the same video always lands on the same row, and local listening state is never touched).

import { invoke } from '@tauri-apps/api/core';
import { mapEpisode, mapFeed } from '@/pages/podcast/types';
import type {
  CloudEpisodeInput,
  PodcastEpisode,
  PodcastFeed,
  RawPodcastEpisode,
  RawPodcastFeed,
} from '@/pages/podcast/types';
import { youtubeWatchUrl } from './videoFilters';
import type { VideoSummary } from './videosApi';

/** One placeholder feed per channel keeps a channel's videos together; videos are never "subscribed". */
export function videoImportInput(video: VideoSummary): CloudEpisodeInput {
  return {
    feed_url: `flexilingo://videos/${encodeURIComponent(video.channel_id ?? 'catalogue')}`,
    podcast_title: video.channel ?? 'YouTube',
    podcast_image_url: video.thumbnail,
    podcast_language: video.language,
    guid: `yt:${video.youtube_id}`,
    video_id: null,
    curated_episode_id: null,
    title: video.title,
    audio_url: youtubeWatchUrl(video.youtube_id),
    duration_seconds: video.duration_sec ? Math.round(video.duration_sec) : null,
    image_url: video.thumbnail,
    difficulty_band: video.cefr_level,
    difficulty_lang: video.language,
  };
}

/** The episode object the player runs on: the imported row plus what makes it a video. */
export function asVideoEpisode(base: PodcastEpisode, video: VideoSummary): PodcastEpisode {
  return {
    ...base,
    title: video.title,
    durationSeconds: video.duration_sec ? Math.round(video.duration_sec) : base.durationSeconds,
    cefrLevel: video.cefr_level ?? base.cefrLevel,
    imageUrl: video.thumbnail,
    difficultyLang: video.language,
    transcriptLang: video.language,
    youtubeId: video.youtube_id,
    catalogueVideoId: video.id,
  };
}

export async function importVideoEpisode(
  video: VideoSummary,
): Promise<{ episode: PodcastEpisode; feed: PodcastFeed }> {
  const localId = await invoke<string>('podcast_import_cloud_episode', {
    episode: videoImportInput(video),
  });
  const raw = await invoke<RawPodcastEpisode>('podcast_get_episode', { id: localId });
  const base = mapEpisode(raw);
  const rawFeed = await invoke<RawPodcastFeed>('podcast_get_feed', { id: base.feedId });
  return { episode: asVideoEpisode(base, video), feed: mapFeed(rawFeed) };
}
