import type { FavoriteEpisode, HistoryEpisode } from '../services/podcastAccount';

/** The in-progress episode as the local database knows it (`overview_get_listening`). */
export interface LocalListeningRow {
  id: string;
  title: string;
  image_url: string | null;
  position_seconds: number;
  duration_seconds: number;
  last_played_at: string;
}

/** A locally saved episode (works signed out and offline). */
export interface LocalFavorite {
  localEpisodeId: string;
  videoId: string | null;
  title: string;
  showTitle: string | null;
  imageUrl: string | null;
  durationSeconds: number;
  savedAt: number;
}

export type MergeSource = 'cloud' | 'local' | 'both';

export interface HistoryEntry {
  /** video_id when the episode is in the catalogue, else the local episode id. */
  key: string;
  videoId: string | null;
  localEpisodeId: string | null;
  cloud: HistoryEpisode | null;
  title: string;
  showTitle: string | null;
  imageUrl: string | null;
  durationSeconds: number;
  progressSeconds: number;
  lastPlayedAt: number;
  completed: boolean;
  source: MergeSource;
}

const time = (iso: string | null | undefined): number => {
  const ms = iso
    ? Date.parse(iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T') + 'Z')
    : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * The account's listening history merged with what this machine knows. The same episode (matched on
 * its catalogue video id, or the local id) shows once: the more recent of the two sources decides the
 * resume position, and both sources are remembered. Newest first.
 */
export function mergeHistory(
  cloud: HistoryEpisode[],
  local: LocalListeningRow[],
  /** Local episode id -> catalogue video id, where the local row came from the catalogue. */
  localVideoIds: Record<string, string | null | undefined> = {},
): HistoryEntry[] {
  const map = new Map<string, HistoryEntry>();
  for (const c of cloud) {
    const key = c.video_id ?? `cloud:${c.id}`;
    map.set(key, {
      key,
      videoId: c.video_id,
      localEpisodeId: null,
      cloud: c,
      title: c.title,
      showTitle: c.podcast_title,
      imageUrl: c.image_url ?? c.podcast_image,
      durationSeconds: c.duration_seconds ?? 0,
      progressSeconds: c.listen_progress_seconds,
      lastPlayedAt: time(c.last_played_at),
      completed: c.is_completed,
      source: 'cloud',
    });
  }
  for (const l of local) {
    const videoId = localVideoIds[l.id] ?? null;
    const key = videoId ?? `local:${l.id}`;
    const at = time(l.last_played_at);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        videoId,
        localEpisodeId: l.id,
        cloud: null,
        title: l.title,
        showTitle: null,
        imageUrl: l.image_url,
        durationSeconds: l.duration_seconds,
        progressSeconds: l.position_seconds,
        lastPlayedAt: at,
        completed: false,
        source: 'local',
      });
      continue;
    }
    const localIsNewer = at > existing.lastPlayedAt;
    map.set(key, {
      ...existing,
      localEpisodeId: l.id,
      source: 'both',
      progressSeconds: localIsNewer ? l.position_seconds : existing.progressSeconds,
      lastPlayedAt: Math.max(at, existing.lastPlayedAt),
      completed: localIsNewer ? false : existing.completed,
      imageUrl: existing.imageUrl ?? l.image_url,
    });
  }
  return [...map.values()].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

export interface SavedEntry {
  key: string;
  videoId: string | null;
  localEpisodeId: string | null;
  cloud: FavoriteEpisode | null;
  title: string;
  showTitle: string | null;
  imageUrl: string | null;
  durationSeconds: number;
  savedAt: number;
  /** false = left the catalogue and has no local copy to play. */
  available: boolean;
  source: MergeSource;
}

/** Saved episodes from the account plus the ones saved on this machine, one row per episode, newest first. */
export function mergeFavourites(cloud: FavoriteEpisode[], local: LocalFavorite[]): SavedEntry[] {
  const map = new Map<string, SavedEntry>();
  for (const c of cloud) {
    map.set(c.videoId, {
      key: c.videoId,
      videoId: c.videoId,
      localEpisodeId: null,
      cloud: c,
      title: c.title ?? '',
      showTitle: c.podcastTitle,
      imageUrl: c.imageUrl,
      durationSeconds: c.durationSeconds ?? 0,
      savedAt: time(c.createdAt),
      available: c.available,
      source: 'cloud',
    });
  }
  for (const l of local) {
    const key = l.videoId ?? `local:${l.localEpisodeId}`;
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        localEpisodeId: l.localEpisodeId,
        available: true,
        source: 'both',
        savedAt: Math.max(existing.savedAt, l.savedAt),
      });
    } else {
      map.set(key, {
        key,
        videoId: l.videoId,
        localEpisodeId: l.localEpisodeId,
        cloud: null,
        title: l.title,
        showTitle: l.showTitle,
        imageUrl: l.imageUrl,
        durationSeconds: l.durationSeconds,
        savedAt: l.savedAt,
        available: true,
        source: 'local',
      });
    }
  }
  return [...map.values()].sort((a, b) => b.savedAt - a.savedAt);
}

/** True when the episode is saved on either side. */
export const isSaved = (
  saved: { videoId: string | null; localEpisodeId: string | null }[],
  episode: { videoId?: string | null; id: string },
): boolean =>
  saved.some(
    (s) => (episode.videoId && s.videoId === episode.videoId) || s.localEpisodeId === episode.id,
  );
