import { create } from 'zustand';
import { useAuthStore } from '@/stores/authStore';
import type { PodcastEpisode, PodcastFeed } from '../types';
import { toggleFavoriteEpisode } from '../services/podcastAccount';
import type { LocalFavorite } from '../utils/accountMerge';

const STORAGE_KEY = 'podcast.localFavorites';

const load = (): LocalFavorite[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};
const persist = (items: LocalFavorite[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage full or blocked: the save lives for this session only */
  }
};

interface FavoritesState {
  local: LocalFavorite[];
  pendingId: string | null;
  error: string | null;
  isSavedLocally: (episode: Pick<PodcastEpisode, 'id' | 'videoId'>) => boolean;
  /** Saves/unsaves on this machine at once; with a catalogue id and an account, on the account too. */
  toggle: (episode: PodcastEpisode, feed?: PodcastFeed | null) => Promise<void>;
  /** Drops a local save without touching the account (the saved-episodes tab removes the account's side itself). */
  removeLocal: (localEpisodeId: string) => void;
  clearError: () => void;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  local: load(),
  pendingId: null,
  error: null,

  isSavedLocally: (ep) => get().local.some((l) => l.localEpisodeId === ep.id),

  toggle: async (episode, feed) => {
    const prev = get().local;
    const wasSaved = get().isSavedLocally(episode);
    const next = wasSaved
      ? prev.filter((l) => l.localEpisodeId !== episode.id)
      : [
          {
            localEpisodeId: episode.id,
            videoId: episode.videoId ?? null,
            title: episode.title,
            showTitle: feed?.title ?? null,
            imageUrl: episode.imageUrl ?? feed?.artworkUrl ?? null,
            durationSeconds: episode.durationSeconds,
            savedAt: Date.now(),
          },
          ...prev,
        ];
    persist(next);
    set({ local: next, error: null });

    const videoId = episode.videoId;
    if (!videoId || !useAuthStore.getState().session) return;
    set({ pendingId: episode.id });
    try {
      await toggleFavoriteEpisode(videoId);
    } catch (e) {
      // Put the local state back: a silent no-op would read as saved on the account.
      persist(prev);
      set({ local: prev, error: String(e) });
    } finally {
      set({ pendingId: null });
    }
  },

  removeLocal: (localEpisodeId) => {
    const next = get().local.filter((l) => l.localEpisodeId !== localEpisodeId);
    persist(next);
    set({ local: next });
  },

  clearError: () => set({ error: null }),
}));
