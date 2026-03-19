import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  PodcastFeed,
  PodcastEpisode,
  PodcastBookmark,
  ITunesSearchResult,
  PodcastTranscriptSegment,
  NlpAnalysis,
  EpisodeDownloadProgress,
  RawPodcastFeed,
  RawPodcastEpisode,
  RawPodcastBookmark,
  RawITunesSearchResult,
  RawPodcastTranscriptSegment,
  RawNlpAnalysis,
} from '../types';
import {
  mapFeed,
  mapEpisode,
  mapBookmark,
  mapITunesResult,
  mapTranscriptSegment,
  mapNlpAnalysis,
} from '../types';

export type PodcastView = 'feeds' | 'episodes' | 'search' | 'player';

interface PodcastState {
  view: PodcastView;

  // Feeds
  feeds: PodcastFeed[];
  isLoadingFeeds: boolean;
  isAddingFeed: boolean;

  // Episodes
  activeFeed: PodcastFeed | null;
  episodes: PodcastEpisode[];
  isLoadingEpisodes: boolean;

  // Bookmarks
  bookmarks: PodcastBookmark[];

  // Search
  searchResults: ITunesSearchResult[];
  isSearching: boolean;
  searchQuery: string;

  // Transcript
  transcriptSegments: PodcastTranscriptSegment[];
  isTranscribing: boolean;
  isLoadingTranscript: boolean;

  // NLP
  nlpAnalysis: NlpAnalysis | null;

  // Download
  downloadProgress: EpisodeDownloadProgress | null;
  isDownloading: boolean;

  // Active player episode
  activeEpisode: PodcastEpisode | null;

  // Error
  error: string | null;

  // Actions
  setView: (view: PodcastView) => void;
  goBack: () => void;

  fetchFeeds: () => Promise<void>;
  addFeed: (feedUrl: string, language?: string) => Promise<void>;
  deleteFeed: (id: string) => Promise<void>;
  refreshFeed: (id: string) => Promise<void>;
  openFeed: (feed: PodcastFeed) => void;

  fetchEpisodes: (feedId: string) => Promise<void>;
  updateProgress: (episodeId: string, position: number, isPlayed?: boolean) => Promise<void>;

  addBookmark: (
    episodeId: string,
    positionMs: number,
    label?: string,
    note?: string,
  ) => Promise<void>;
  fetchBookmarks: (episodeId: string) => Promise<void>;
  deleteBookmark: (id: string) => Promise<void>;

  searchItunes: (term: string, language?: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  subscribeFromSearch: (result: ITunesSearchResult) => Promise<void>;

  // Download
  downloadEpisode: (episodeId: string) => Promise<string | null>;
  deleteDownload: (episodeId: string) => Promise<void>;
  setDownloadProgress: (progress: EpisodeDownloadProgress | null) => void;

  // Transcript
  transcribeEpisode: (episodeId: string) => Promise<void>;
  fetchTranscriptSegments: (episodeId: string) => Promise<void>;

  // NLP
  fetchAnalysis: (episodeId: string) => Promise<void>;

  // Player view
  openPlayer: (episode: PodcastEpisode, feed?: PodcastFeed) => void;

  clearError: () => void;
}

export const usePodcastStore = create<PodcastState>()(
  immer((set, get) => ({
    view: 'feeds',
    feeds: [],
    isLoadingFeeds: false,
    isAddingFeed: false,
    activeFeed: null,
    episodes: [],
    isLoadingEpisodes: false,
    bookmarks: [],
    searchResults: [],
    isSearching: false,
    searchQuery: '',
    transcriptSegments: [],
    isTranscribing: false,
    isLoadingTranscript: false,
    nlpAnalysis: null,
    downloadProgress: null,
    isDownloading: false,
    activeEpisode: null,
    error: null,

    setView: (view) =>
      set((s) => {
        s.view = view;
        s.error = null;
      }),
    goBack: () =>
      set((s) => {
        if (s.view === 'episodes') {
          s.view = 'feeds';
          s.activeFeed = null;
          s.episodes = [];
        } else if (s.view === 'search') {
          s.view = 'feeds';
        } else if (s.view === 'player') {
          s.view = 'episodes';
          s.transcriptSegments = [];
          s.nlpAnalysis = null;
        }
        s.error = null;
      }),

    fetchFeeds: async () => {
      set((s) => {
        s.isLoadingFeeds = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawPodcastFeed[]>('podcast_list_feeds');
        set((s) => {
          s.feeds = raw.map(mapFeed);
          s.isLoadingFeeds = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingFeeds = false;
        });
      }
    },

    addFeed: async (feedUrl, language) => {
      set((s) => {
        s.isAddingFeed = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawPodcastFeed>('podcast_add_feed', {
          feedUrl,
          language: language ?? null,
        });
        const feed = mapFeed(raw);
        set((s) => {
          s.feeds.unshift(feed);
          s.isAddingFeed = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isAddingFeed = false;
        });
      }
    },

    deleteFeed: async (id) => {
      try {
        await invoke('podcast_delete_feed', { id });
        set((s) => {
          s.feeds = s.feeds.filter((f) => f.id !== id);
          if (s.activeFeed?.id === id) {
            s.activeFeed = null;
            s.episodes = [];
            s.view = 'feeds';
          }
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    refreshFeed: async (id) => {
      try {
        const raw = await invoke<RawPodcastFeed>('podcast_refresh_feed', { id });
        const feed = mapFeed(raw);
        set((s) => {
          const idx = s.feeds.findIndex((f) => f.id === id);
          if (idx >= 0) s.feeds[idx] = feed;
          if (s.activeFeed?.id === id) s.activeFeed = feed;
        });
        // Refresh episodes if viewing this feed
        if (get().activeFeed?.id === id) {
          get().fetchEpisodes(id);
        }
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    openFeed: (feed) => {
      set((s) => {
        s.activeFeed = feed;
        s.episodes = [];
        s.view = 'episodes';
        s.error = null;
      });
      get().fetchEpisodes(feed.id);
    },

    fetchEpisodes: async (feedId) => {
      set((s) => {
        s.isLoadingEpisodes = true;
      });
      try {
        const raw = await invoke<RawPodcastEpisode[]>('podcast_list_episodes', {
          feedId,
          limit: 100,
        });
        set((s) => {
          s.episodes = raw.map(mapEpisode);
          s.isLoadingEpisodes = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingEpisodes = false;
        });
      }
    },

    updateProgress: async (episodeId, position, isPlayed) => {
      try {
        await invoke('podcast_update_progress', {
          episodeId,
          position,
          isPlayed: isPlayed ?? null,
        });
        set((s) => {
          const ep = s.episodes.find((e) => e.id === episodeId);
          if (ep) {
            ep.playPosition = position;
            if (isPlayed != null) ep.isPlayed = isPlayed;
          }
        });
      } catch {
        /* best-effort */
      }
    },

    addBookmark: async (episodeId, positionMs, label, note) => {
      try {
        const raw = await invoke<RawPodcastBookmark>('podcast_add_bookmark', {
          episodeId,
          positionMs,
          label: label ?? null,
          note: note ?? null,
        });
        set((s) => {
          s.bookmarks.push(mapBookmark(raw));
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    fetchBookmarks: async (episodeId) => {
      try {
        const raw = await invoke<RawPodcastBookmark[]>('podcast_list_bookmarks', { episodeId });
        set((s) => {
          s.bookmarks = raw.map(mapBookmark);
        });
      } catch {
        /* best-effort */
      }
    },

    deleteBookmark: async (id) => {
      try {
        await invoke('podcast_delete_bookmark', { id });
        set((s) => {
          s.bookmarks = s.bookmarks.filter((b) => b.id !== id);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    searchItunes: async (term, language) => {
      set((s) => {
        s.isSearching = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawITunesSearchResult[]>('podcast_search_itunes', {
          term,
          language: language ?? null,
        });
        set((s) => {
          s.searchResults = raw.map(mapITunesResult);
          s.isSearching = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isSearching = false;
        });
      }
    },

    setSearchQuery: (query) =>
      set((s) => {
        s.searchQuery = query;
      }),

    subscribeFromSearch: async (result) => {
      await get().addFeed(result.feedUrl);
    },

    // ── Download ─────────────────────────────────────

    downloadEpisode: async (episodeId) => {
      set((s) => {
        s.error = null;
      });
      try {
        const jobId = await invoke<string>('podcast_start_download_job', { episodeId });
        return jobId;
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
        return null;
      }
    },

    deleteDownload: async (episodeId) => {
      try {
        await invoke('podcast_delete_download', { episodeId });
        set((s) => {
          const ep = s.episodes.find((e) => e.id === episodeId);
          if (ep) {
            ep.isDownloaded = false;
            ep.localPath = undefined;
          }
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    setDownloadProgress: (progress) => {
      set((s) => {
        s.downloadProgress = progress;
      });
    },

    // ── Transcript ───────────────────────────────────

    transcribeEpisode: async (episodeId) => {
      set((s) => {
        s.transcriptSegments = [];
        s.error = null;
      });
      try {
        await invoke<string>('podcast_start_transcribe_job', { episodeId });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    fetchTranscriptSegments: async (episodeId) => {
      set((s) => {
        s.isLoadingTranscript = true;
      });
      try {
        const raw = await invoke<RawPodcastTranscriptSegment[]>('podcast_get_transcript_segments', {
          episodeId,
        });
        set((s) => {
          s.transcriptSegments = raw.map(mapTranscriptSegment);
          s.isLoadingTranscript = false;
        });
      } catch {
        set((s) => {
          s.isLoadingTranscript = false;
        });
      }
    },

    // ── NLP ──────────────────────────────────────────

    fetchAnalysis: async (episodeId) => {
      try {
        const raw = await invoke<RawNlpAnalysis>('podcast_get_analysis', { episodeId });
        set((s) => {
          s.nlpAnalysis = mapNlpAnalysis(raw);
        });
      } catch {
        set((s) => {
          s.nlpAnalysis = null;
        });
      }
    },

    // ── Player View ──────────────────────────────────

    openPlayer: (episode, feed) => {
      set((s) => {
        s.activeEpisode = episode;
        if (feed) s.activeFeed = feed;
        s.view = 'player';
        s.transcriptSegments = [];
        s.isLoadingTranscript = false;
        s.nlpAnalysis = null;
        s.error = null;
      });
      // Always try to load transcript and analysis — segments may exist in DB
      // regardless of transcript_status value
      get().fetchTranscriptSegments(episode.id);
      get().fetchAnalysis(episode.id);
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),
  })),
);
