import type { PodcastEpisode } from '../types';

const SITE = 'https://flexilingo.com';

/**
 * The website page someone else can open for this episode or video (the player's Share), or null
 * when it has none: a feed only this computer follows is not on the website.
 */
export function publicEpisodeUrl(
  episode: Pick<PodcastEpisode, 'videoId' | 'catalogueVideoId' | 'youtubeId'>,
): string | null {
  if (episode.youtubeId && episode.catalogueVideoId)
    return `${SITE}/videos/watch/${encodeURIComponent(episode.catalogueVideoId)}`;
  const match = episode.videoId?.match(/^podcast_(-?\d+)_ep_-?\d+$/);
  if (!match || !episode.videoId) return null;
  return `${SITE}/podcasts/${match[1]}/player?video_id=${encodeURIComponent(episode.videoId)}`;
}
