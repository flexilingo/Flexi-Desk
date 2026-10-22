import type { PodcastEpisode } from '@/pages/podcast/types';
import { bookTrackId, parseBookTrackId, type BookEdition } from './book-audio';

/**
 * A book track as the player's own kind of thing — `PodcastEpisode.bookTrack` is the
 * `book` media kind, the way `youtubeId` is the video kind. The id is namespaced
 * (`book:<edition>:<track>`) so it can never collide with a real episode's id.
 */
export function bookEpisode(
  edition: BookEdition,
  track: number,
  audioUrl: string,
  title: string,
  returnTo: string,
): PodcastEpisode {
  return {
    id: bookTrackId(edition.id, track),
    feedId: edition.id,
    title,
    audioUrl,
    durationSeconds: 0,
    isDownloaded: false,
    playPosition: 0,
    isPlayed: false,
    transcriptStatus: 'none',
    createdAt: new Date(0).toISOString(),
    transcriptSource: 'local',
    cloudTranscriptStatus: 'unknown',
    bookTrack: {
      edition: edition.id,
      track,
      language: edition.language,
      showName: edition.label,
      returnTo,
    },
  };
}

/** The recording an episode stands for, or null for anything that is not a book track. */
export function bookTrackOf(episode: PodcastEpisode | null | undefined) {
  if (!episode?.bookTrack) return null;
  const parsed = parseBookTrackId(episode.id);
  return parsed ? { ...episode.bookTrack, edition: parsed.edition, track: parsed.track } : null;
}
