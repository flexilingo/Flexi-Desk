import type { CuratedEpisodeLite, EpisodeByLevel } from '../types';

/**
 * Maps a curated episode row (popular / browse / curated variants) to the shape the standard
 * EpisodeLevelCard renders, so every episode list shares one image-forward card.
 */
export function curatedToEpisodeByLevel(ep: CuratedEpisodeLite): EpisodeByLevel {
  const videoId =
    ep.video_id ??
    (ep.feed_id != null && ep.episode_id != null
      ? `podcast_${ep.feed_id}_ep_${ep.episode_id}`
      : '');
  return {
    id: ep.id,
    feed_id: ep.feed_id,
    podcast_id: null,
    video_id: videoId,
    title: ep.title,
    description: ep.description ?? null,
    image_url: ep.image_url,
    audio_url: ep.audio_url,
    duration_seconds: ep.duration_seconds,
    publish_date: ep.publish_date,
    speech_rate_wpm: ep.speech_rate_wpm,
    difficulty_score: ep.difficulty_score ?? null,
    difficulty_band: ep.difficulty_band ?? null,
    difficulty_range_low: ep.difficulty_range_low ?? null,
    difficulty_range_high: ep.difficulty_range_high ?? null,
    difficulty_confidence: ep.difficulty_confidence ?? null,
    difficulty_lang: ep.difficulty_lang ?? null,
    podcast_title: ep.podcast_title ?? null,
    podcast_author: null,
  };
}
