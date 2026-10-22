import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { supabaseCall } from '@/lib/supabase';
import type {
  PodcastFeed,
  PodcastEpisode,
  PodcastIndexFeed,
  PodcastTranscriptSegment,
  NlpAnalysis,
  TranscriptSource,
  TranscriptSourceInfo,
  EpisodeDownloadProgress,
  RawPodcastFeed,
  RawPodcastEpisode,
  RawPodcastBookmark,
  RawPodcastTranscriptSegment,
  RawNlpAnalysis,
  SearchResponse,
} from '../types';
import { mapFeed, mapEpisode, mapTranscriptSegment, mapNlpAnalysis } from '../types';

interface PodcastState {
  // Feeds
  feeds: PodcastFeed[];
  isLoadingFeeds: boolean;
  isAddingFeed: boolean;

  // Episodes
  activeFeed: PodcastFeed | null;
  episodes: PodcastEpisode[];
  isLoadingEpisodes: boolean;

  // Search
  searchResults: PodcastIndexFeed[];
  isSearching: boolean;
  searchQuery: string;
  searchHasMore: boolean;
  searchMax: number;

  // Transcript
  transcriptSegments: PodcastTranscriptSegment[];
  isTranscribing: boolean;
  isLoadingTranscript: boolean;

  // NLP
  nlpAnalysis: NlpAnalysis | null;
  /** Which transcripts exist for the active episode, and which is showing. */
  transcriptSourceInfo: TranscriptSourceInfo | null;
  isFetchingCloudTranscript: boolean;

  // Download
  downloadProgress: EpisodeDownloadProgress | null;
  isDownloading: boolean;

  // Active player episode
  activeEpisode: PodcastEpisode | null;

  // Error
  error: string | null;

  // Actions
  /** Loads a feed's episodes. Navigation is the router's job, not the store's. */
  loadFeed: (feed: PodcastFeed) => void;
  /** Clears per-episode session state when leaving the player. */
  clearEpisode: () => void;

  fetchFeeds: () => Promise<void>;
  addFeed: (feedUrl: string, language?: string) => Promise<void>;
  deleteFeed: (id: string) => Promise<void>;
  refreshFeed: (id: string) => Promise<void>;

  fetchEpisodes: (feedId: string) => Promise<void>;
  updateProgress: (episodeId: string, position: number, isPlayed?: boolean) => Promise<void>;

  /** A note at a moment (the selection bar's Note): kept on this computer, listed on the Notes page. */
  addBookmark: (
    episodeId: string,
    positionMs: number,
    label?: string,
    note?: string,
  ) => Promise<void>;

  searchPodcasts: (term: string) => Promise<void>;
  searchLoadMore: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  subscribeFromSearch: (result: PodcastIndexFeed) => Promise<void>;

  // Download
  downloadEpisode: (episodeId: string) => Promise<string | null>;
  deleteDownload: (episodeId: string) => Promise<void>;
  setDownloadProgress: (progress: EpisodeDownloadProgress | null) => void;

  // Transcript
  transcribeEpisode: (episodeId: string) => Promise<void>;
  fetchTranscriptSegments: (episodeId: string) => Promise<void>;
  fetchTranscriptSourceInfo: (episodeId: string) => Promise<void>;
  /** Loads whatever transcript this episode should show, fetching the cloud one if needed. */
  ensureTranscript: (episodeId: string) => Promise<void>;
  fetchCloudTranscript: (episodeId: string) => Promise<void>;
  setTranscriptSource: (episodeId: string, source: TranscriptSource) => Promise<void>;

  // NLP
  fetchAnalysis: (episodeId: string) => Promise<void>;

  // Player view
  loadEpisode: (episode: PodcastEpisode, feed?: PodcastFeed) => void;
  /** Deep-link support: hydrate an episode straight from its local id. */
  loadEpisodeById: (episodeId: string) => Promise<PodcastEpisode | null>;
  /** Re-read the episode row after anything that mutates it server-side
   *  (transcription stamps transcript_lang, cloud fetch, source switch) — the
   *  in-memory object otherwise keeps answering with pre-transcription data. */
  refreshActiveEpisode: (episodeId: string) => Promise<void>;

  clearError: () => void;
}

export const usePodcastStore = create<PodcastState>()(
  immer((set, get) => ({
    feeds: [],
    isLoadingFeeds: false,
    isAddingFeed: false,
    activeFeed: null,
    episodes: [],
    isLoadingEpisodes: false,
    searchResults: [],
    isSearching: false,
    searchQuery: '',
    searchHasMore: false,
    searchMax: 20,
    transcriptSegments: [],
    isTranscribing: false,
    isLoadingTranscript: false,
    nlpAnalysis: null,
    transcriptSourceInfo: null,
    isFetchingCloudTranscript: false,
    downloadProgress: null,
    isDownloading: false,
    activeEpisode: null,
    error: null,

    clearEpisode: () =>
      set((s) => {
        s.transcriptSegments = [];
        s.nlpAnalysis = null;
        s.transcriptSourceInfo = null;
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

    loadFeed: (feed) => {
      set((s) => {
        s.activeFeed = feed;
        s.episodes = [];
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
        await invoke<RawPodcastBookmark>('podcast_add_bookmark', {
          episodeId,
          positionMs,
          label: label ?? null,
          note: note ?? null,
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    searchPodcasts: async (term) => {
      const PAGE_SIZE = 20;
      set((s) => {
        s.isSearching = true;
        s.searchResults = [];
        s.searchHasMore = false;
        s.searchMax = PAGE_SIZE;
        s.error = null;
      });
      try {
        const res = await supabaseCall<SearchResponse>(
          'GET',
          `/podcast?action=search&q=${encodeURIComponent(term)}&max=${PAGE_SIZE}`,
        );
        set((s) => {
          s.searchResults = res.feeds ?? [];
          s.searchHasMore = (res.feeds ?? []).length >= PAGE_SIZE;
          s.isSearching = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isSearching = false;
        });
      }
    },

    searchLoadMore: async () => {
      const PAGE_SIZE = 20;
      const { searchQuery, searchMax, isSearching } = get();
      if (!searchQuery.trim() || isSearching) return;
      const newMax = searchMax + PAGE_SIZE;
      set((s) => {
        s.isSearching = true;
      });
      try {
        const res = await supabaseCall<SearchResponse>(
          'GET',
          `/podcast?action=search&q=${encodeURIComponent(searchQuery.trim())}&max=${newMax}`,
        );
        set((s) => {
          s.searchResults = res.feeds ?? [];
          s.searchMax = newMax;
          s.searchHasMore = (res.feeds ?? []).length >= newMax;
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
      if (!result.rssUrl) return;
      await get().addFeed(result.rssUrl);
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
        // Whenever the transcript display refreshes, the episode row may have
        // changed underneath it (transcript_lang stamp, status, word count).
        await get().refreshActiveEpisode(episodeId);
      } catch {
        set((s) => {
          s.isLoadingTranscript = false;
        });
      }
    },

    refreshActiveEpisode: async (episodeId) => {
      try {
        const raw = await invoke<RawPodcastEpisode>('podcast_get_episode', { id: episodeId });
        const episode = mapEpisode(raw);
        // A malformed payload must never replace a working episode object —
        // overwriting state with an unvalidated response is the exact bug class
        // that white-screened the podcast hub twice.
        if (episode.id !== episodeId) return;
        set((s) => {
          if (s.activeEpisode?.id === episodeId) s.activeEpisode = episode;
          const i = s.episodes.findIndex((e) => e.id === episodeId);
          if (i >= 0) s.episodes[i] = episode;
        });
      } catch {
        // Keep the stale object — a failed refresh must not blank the player.
      }
    },

    fetchTranscriptSourceInfo: async (episodeId) => {
      try {
        const info = await invoke<TranscriptSourceInfo>('podcast_transcript_source_info', {
          episodeId,
        });
        // The user can switch episodes faster than this resolves; a late answer
        // for the previous episode must never overwrite the current one's.
        if (get().activeEpisode?.id !== episodeId) return;
        set((s) => {
          s.transcriptSourceInfo = info;
        });
      } catch {
        if (get().activeEpisode?.id !== episodeId) return;
        set((s) => {
          s.transcriptSourceInfo = null;
        });
      }
    },

    /**
     * Decides what the player shows for an episode.
     *
     * Local (Whisper on this machine) always wins when it exists. Otherwise, if
     * FlexiLingo already analyzed the episode, load their transcript right away —
     * the user shouldn't have to click anything to see subtitles that exist.
     *
     * Lives in the store rather than a component effect so switching episodes
     * can't race a stale `transcriptSourceInfo` from the previous one.
     */
    ensureTranscript: async (episodeId) => {
      await get().fetchTranscriptSourceInfo(episodeId);

      const info = get().transcriptSourceInfo;
      if (!info || info.episode_id !== episodeId) return;
      if (get().activeEpisode?.id !== episodeId) return;

      if (info.has_local || info.has_cloud) return;
      if (!info.cloud_possible || info.cloud_status === 'unavailable') return;

      await get().fetchCloudTranscript(episodeId);
    },

    /**
     * Pulls FlexiLingo's transcript + analysis and makes it active. The local
     * Whisper transcript, if any, stays cached and can be switched back to.
     */
    fetchCloudTranscript: async (episodeId) => {
      set((s) => {
        s.isFetchingCloudTranscript = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawPodcastTranscriptSegment[]>('podcast_fetch_cloud_transcript', {
          episodeId,
        });
        // Segments are cached in SQLite regardless; only the *display* is stale.
        if (get().activeEpisode?.id !== episodeId) {
          set((s) => {
            s.isFetchingCloudTranscript = false;
          });
          return;
        }
        set((s) => {
          s.transcriptSegments = raw.map(mapTranscriptSegment);
          s.isFetchingCloudTranscript = false;
        });
        await get().fetchTranscriptSourceInfo(episodeId);
        await get().fetchAnalysis(episodeId);
        await get().refreshActiveEpisode(episodeId);
      } catch (err) {
        set((s) => {
          s.isFetchingCloudTranscript = false;
          s.error = String(err);
        });
      }
    },

    /** Switch between the two cached transcripts. Instant, and works offline. */
    setTranscriptSource: async (episodeId, source) => {
      try {
        await invoke('podcast_set_transcript_source', { episodeId, source });
        await get().fetchTranscriptSegments(episodeId);
        await get().fetchTranscriptSourceInfo(episodeId);
        await get().fetchAnalysis(episodeId);
        await get().refreshActiveEpisode(episodeId);
      } catch (err) {
        set((s) => {
          s.error = String(err);
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

    loadEpisode: (episode, feed) => {
      set((s) => {
        s.activeEpisode = episode;
        // The active feed must be THIS episode's feed. Keeping a stale one from
        // earlier browsing leaks the wrong feed's language into word lookups and
        // transcription (a French episode inherited 'en' from the last-viewed feed).
        if (feed) {
          s.activeFeed = feed;
        } else if (s.activeFeed?.id !== episode.feedId) {
          s.activeFeed = s.feeds.find((f) => f.id === episode.feedId) ?? null;
        }
        s.transcriptSegments = [];
        s.isLoadingTranscript = false;
        s.nlpAnalysis = null;
        // Belongs to the previous episode — leaving it stale made the player
        // skip auto-loading the new episode's cloud transcript.
        s.transcriptSourceInfo = null;
        s.error = null;
      });
      // The feeds list only holds SUBSCRIBED feeds; an episode played from
      // discovery or a cloud import belongs to an unsubscribed feed row. Fetch
      // that row directly so the language fallback chain has a real feed.
      if (!get().activeFeed) {
        invoke<RawPodcastFeed>('podcast_get_feed', { id: episode.feedId })
          .then((raw) => {
            if (get().activeEpisode?.id !== episode.id || get().activeFeed) return;
            set((s) => {
              s.activeFeed = mapFeed(raw);
            });
          })
          .catch(() => {});
      }
      // Always try to load transcript and analysis — segments may exist in DB
      // regardless of transcript_status value
      get().fetchTranscriptSegments(episode.id);
      get().fetchAnalysis(episode.id);
      get().ensureTranscript(episode.id);
    },

    // Deep-link entry: /podcast/player/:episodeId can be opened cold (page reload,
    // back/forward, mini-player expand) with nothing in the store yet.
    loadEpisodeById: async (episodeId) => {
      const existing = get().activeEpisode;
      if (existing?.id === episodeId) return existing;

      const cached = get().episodes.find((e) => e.id === episodeId);
      if (cached) {
        get().loadEpisode(cached);
        return cached;
      }

      try {
        const raw = await invoke<RawPodcastEpisode>('podcast_get_episode', { id: episodeId });
        const episode = mapEpisode(raw);
        get().loadEpisode(episode);
        return episode;
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
        return null;
      }
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),
  })),
);
