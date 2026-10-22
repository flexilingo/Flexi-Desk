import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type { PodcastEpisode, PodcastFeed } from '../types';
import {
  beginCloudProgress,
  endCloudProgress,
  flushCloudProgress,
  reportCloudCompletion,
  reportCloudProgress,
} from '../services/cloudProgress';
import { loadPlayerPrefs, savePlayerPrefs, type PlayerPrefs } from '../services/playerPrefs';
import { youtubeMedia, type MediaLike } from '@/pages/videos/player/YouTubeMedia';

// ── Singleton Audio Element ────────────────────────────

let audioEl: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
  return audioEl;
}

/** The audio element, for the Listening Program's clip player (audio episodes only). */
export const getPlayerAudio = (): HTMLAudioElement => getAudio();

// While a practice program drives the playhead (seeking back and forth over a short clip), the
// position-derived writes - local resume position and the account heartbeat - are held back, so a
// drill does not become "where you stopped listening".
let progressSuppressed = false;
export function setProgressSuppressed(on: boolean): void {
  progressSuppressed = on;
}

// The media the transport drives: the audio element, or — for a catalogue video — the YouTube
// surface. Both speak the same small interface, so every transport action below is shared.
let activeMedia: MediaLike | null = null;

function getMedia(): MediaLike {
  return activeMedia ?? getAudio();
}

const isVideoEpisode = (ep: PodcastEpisode | null | undefined): boolean => !!ep?.youtubeId;

/**
 * A recording of a published textbook (Reader editions). It plays through the audio element like an
 * episode, but is not one: no library row to keep a position on, no account heartbeat, no "episode
 * complete" screen. Its listens are counted by the book listen tracker, not here.
 */
export const isBookEpisode = (ep: PodcastEpisode | null | undefined): boolean => !!ep?.bookTrack;

// ── Timers ──────────────────────────────────────────────

let progressSaveTimer: ReturnType<typeof setInterval> | null = null;
let sleepCountdownTimer: ReturnType<typeof setInterval> | null = null;

// ── State ───────────────────────────────────────────────

interface PlayerState {
  currentEpisode: PodcastEpisode | null;
  currentFeed: PodcastFeed | null;

  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;

  abRepeat: { a: number; b: number } | null;

  sleepTimerRemaining: number | null;

  activeSegmentIndex: number;

  // UI settings
  subtitlesEnabled: boolean;
  focusMode: boolean;
  fontSize: number;
  subtitleBgOpacity: number;
  autoPauseOnBoundary: boolean;
  pauseOnHover: boolean;
  subtitleAlignment: 'left' | 'center' | 'right';

  // Buffering
  isBuffering: boolean;

  // Error
  playError: string | null;

  // Session analytics
  wordsClicked: number;
  wordsAddedToDeck: number;
  activeTimeSpent: number; // ms
  showCompleteOverlay: boolean;

  // Actions
  play: (episode: PodcastEpisode, feed?: PodcastFeed) => void;
  pause: () => void;
  resume: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (vol: number) => void;
  skipForward: (seconds?: number) => void;
  skipBack: (seconds?: number) => void;
  setABRepeat: (a: number, b: number) => void;
  clearABRepeat: () => void;
  setSleepTimer: (minutes: number) => void;
  clearSleepTimer: () => void;
  stop: () => void;
  setActiveSegmentIndex: (index: number) => void;

  // UI settings actions
  toggleSubtitles: () => void;
  toggleFocusMode: () => void;
  setFontSize: (size: number) => void;
  setSubtitleBgOpacity: (opacity: number) => void;
  toggleAutoPauseOnBoundary: () => void;
  togglePauseOnHover: () => void;
  setSubtitleAlignment: (alignment: 'left' | 'center' | 'right') => void;

  // Session analytics actions
  recordWordClick: () => void;
  recordWordAddedToDeck: () => void;
  dismissCompleteOverlay: () => void;

  // Internal — called by audio event listeners
  _onTimeUpdate: (time: number) => void;
  _onDurationChange: (dur: number) => void;
  _onEnded: () => void;
}

// ── Store ───────────────────────────────────────────────

export const usePlayerStore = create<PlayerState>()(
  immer((set, get) => {
    // Attach audio event listeners once
    const audio = getAudio();

    audio.addEventListener('timeupdate', () => {
      get()._onTimeUpdate(audio.currentTime);
    });

    audio.addEventListener('durationchange', () => {
      if (audio.duration && isFinite(audio.duration)) {
        get()._onDurationChange(audio.duration);
      }
    });

    audio.addEventListener('ended', () => {
      get()._onEnded();
    });

    audio.addEventListener('error', () => {
      const code = audio.error?.code;
      const msg = audio.error?.message || 'Unknown audio error';
      const codeNames: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      };
      const errStr = `${codeNames[code ?? 0] || 'UNKNOWN'}: ${msg} (src: ${audio.src.substring(0, 100)})`;
      console.error('[PlayerStore] Audio error:', errStr);
      set((s) => {
        s.isPlaying = false;
        s.playError = errStr;
      });
    });

    audio.addEventListener('loadstart', () => {
      set((s) => {
        s.isBuffering = true;
      });
    });

    audio.addEventListener('waiting', () => {
      set((s) => {
        s.isBuffering = true;
      });
    });

    audio.addEventListener('playing', () => {
      set((s) => {
        s.isBuffering = false;
      });
    });

    audio.addEventListener('canplay', () => {
      set((s) => {
        s.isBuffering = false;
      });
    });

    // The video surface reports through the same handlers, plus the two things only a video can do
    // on its own: start from YouTube's own button, and be paused by a click on the picture.
    const video = youtubeMedia;
    video.addEventListener('timeupdate', () => get()._onTimeUpdate(video.currentTime));
    video.addEventListener('durationchange', () => {
      if (video.duration > 0) get()._onDurationChange(video.duration);
    });
    video.addEventListener('ended', () => get()._onEnded());
    video.addEventListener('error', () => {
      set((s) => {
        s.isPlaying = false;
        s.playError = video.error?.message ?? 'VIDEO_ERROR';
      });
    });
    video.addEventListener('waiting', () => {
      set((s) => {
        s.isBuffering = true;
      });
    });
    video.addEventListener('canplay', () => {
      set((s) => {
        s.isBuffering = false;
      });
    });
    video.addEventListener('playing', () => {
      set((s) => {
        s.isBuffering = false;
        s.isPlaying = true;
      });
    });
    video.addEventListener('pause', () => {
      set((s) => {
        s.isPlaying = false;
      });
    });

    // A catalogue video: load it into the YouTube surface and show it — but never start it. The first
    // play of every video is YouTube's own button (that is what counts as a view); after that the
    // control bar drives it. The same video again changes nothing, so coming back never restarts it.
    const playVideoEpisode = (episode: PodcastEpisode, feed?: PodcastFeed) => {
      if (get().currentEpisode?.id === episode.id && activeMedia === youtubeMedia) {
        if (youtubeMedia.hasStarted) youtubeMedia.play().catch(() => {});
        return;
      }
      getAudio().pause();
      stopProgressSaving();
      endCloudProgress();
      activeMedia = youtubeMedia;
      set((s) => {
        s.currentEpisode = episode;
        s.currentFeed = feed ?? null;
        s.isPlaying = false;
        s.playError = null;
        s.abRepeat = null;
        s.activeSegmentIndex = -1;
        s.currentTime = 0;
        s.duration = episode.durationSeconds > 0 ? episode.durationSeconds : 0;
        s.wordsClicked = 0;
        s.wordsAddedToDeck = 0;
        s.activeTimeSpent = 0;
        s.showCompleteOverlay = false;
      });
      youtubeMedia.playbackRate = get().playbackRate;
      youtubeMedia.volume = get().volume;
      youtubeMedia.load(episode.youtubeId as string);
    };

    return {
      currentEpisode: null,
      currentFeed: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playbackRate: 1.0,
      volume: 1.0,
      abRepeat: null,
      sleepTimerRemaining: null,
      activeSegmentIndex: -1,
      subtitlesEnabled: true,
      focusMode: false,
      fontSize: 24,
      subtitleBgOpacity: 75,
      autoPauseOnBoundary: false,
      pauseOnHover: false,
      subtitleAlignment: 'center' as const,
      isBuffering: false,
      playError: null,
      wordsClicked: 0,
      wordsAddedToDeck: 0,
      activeTimeSpent: 0,
      showCompleteOverlay: false,

      play: (episode, feed) => {
        const audio = getAudio();
        const state = get();

        if (episode.youtubeId) {
          playVideoEpisode(episode, feed);
          return;
        }
        // An audio episode takes over from a video: one thing plays at a time.
        if (activeMedia) {
          youtubeMedia.pause();
          youtubeMedia.unload();
          activeMedia = null;
        }

        // If same episode, just resume
        if (state.currentEpisode?.id === episode.id && audio.src) {
          audio
            .play()
            .then(() => {
              set((s) => {
                s.isPlaying = true;
              });
              startProgressSaving(episode.id);
            })
            .catch((err) => {
              console.error('[PlayerStore] Resume failed:', err);
              set((s) => {
                s.isPlaying = false;
              });
            });
          return;
        }

        // Set episode state immediately (so UI shows the episode)
        set((s) => {
          s.currentEpisode = episode;
          s.currentFeed = feed ?? null;
          s.isPlaying = false;
          s.playError = null;
          s.abRepeat = null;
          s.activeSegmentIndex = -1;
          s.currentTime = episode.playPosition > 0 ? episode.playPosition / 1000 : 0;
          s.wordsClicked = 0;
          s.wordsAddedToDeck = 0;
          s.activeTimeSpent = 0;
          s.showCompleteOverlay = false;
        });

        // Curated episodes report listening back to the account; everything else
        // (local RSS, PodcastIndex-only) is a no-op here.
        beginCloudProgress(episode.curatedEpisodeId);

        // Try to play: local file first, then fall back to remote URL
        const localSrc = episode.localPath ? convertFileSrc(episode.localPath) : null;
        const remoteSrc = episode.audioUrl;

        const tryPlay = (src: string) => {
          console.log('[PlayerStore] Trying:', src.substring(0, 120));
          audio.src = src;
          audio.playbackRate = state.playbackRate;
          audio.volume = state.volume;
          if (episode.playPosition > 0) {
            audio.currentTime = episode.playPosition / 1000;
          }
          return audio.play();
        };

        const onSuccess = () => {
          set((s) => {
            s.isPlaying = true;
            s.playError = null;
          });
          startProgressSaving(episode.id);
        };

        if (localSrc) {
          tryPlay(localSrc)
            .then(onSuccess)
            .catch(() => {
              console.warn('[PlayerStore] Local playback failed, trying remote URL...');
              tryPlay(remoteSrc)
                .then(onSuccess)
                .catch((err) => {
                  console.error('[PlayerStore] Play failed:', err);
                  set((s) => {
                    s.playError = `Cannot play: ${err.message || err}`;
                  });
                });
            });
        } else {
          tryPlay(remoteSrc)
            .then(onSuccess)
            .catch((err) => {
              console.error('[PlayerStore] Play failed:', err);
              set((s) => {
                s.playError = `Cannot play: ${err.message || err}`;
              });
            });
        }
      },

      pause: () => {
        const audio = getMedia();
        audio.pause();
        set((s) => {
          s.isPlaying = false;
        });
        stopProgressSaving();
        saveProgress(get());
      },

      resume: () => {
        const audio = getMedia();
        audio
          .play()
          .then(() => {
            set((s) => {
              s.isPlaying = true;
            });
            const ep = get().currentEpisode;
            if (ep) startProgressSaving(ep.id);
          })
          .catch((err) => {
            console.error('[PlayerStore] Resume failed:', err);
            set((s) => {
              s.isPlaying = false;
            });
          });
      },

      togglePlayPause: () => {
        const state = get();
        if (state.isPlaying) {
          state.pause();
        } else if (state.currentEpisode) {
          state.resume();
        }
      },

      seek: (time) => {
        const audio = getMedia();
        audio.currentTime = time;
        set((s) => {
          s.currentTime = time;
        });
      },

      setPlaybackRate: (rate) => {
        const audio = getMedia();
        audio.playbackRate = rate;
        set((s) => {
          s.playbackRate = rate;
        });
      },

      setVolume: (vol) => {
        const audio = getMedia();
        audio.volume = vol;
        set((s) => {
          s.volume = vol;
        });
      },

      skipForward: (seconds = 15) => {
        const audio = getMedia();
        audio.currentTime = Math.min(audio.currentTime + seconds, audio.duration || 0);
        set((s) => {
          s.currentTime = audio.currentTime;
        });
      },

      skipBack: (seconds = 15) => {
        const audio = getMedia();
        audio.currentTime = Math.max(audio.currentTime - seconds, 0);
        set((s) => {
          s.currentTime = audio.currentTime;
        });
      },

      setABRepeat: (a, b) => {
        set((s) => {
          s.abRepeat = { a, b };
        });
        const audio = getMedia();
        audio.currentTime = a;
      },

      clearABRepeat: () => {
        set((s) => {
          s.abRepeat = null;
        });
      },

      setSleepTimer: (minutes) => {
        get().clearSleepTimer();
        set((s) => {
          s.sleepTimerRemaining = minutes * 60;
        });
        sleepCountdownTimer = setInterval(() => {
          const remaining = get().sleepTimerRemaining;
          if (remaining === null) return;
          if (remaining <= 1) {
            get().pause();
            get().clearSleepTimer();
          } else {
            set((s) => {
              s.sleepTimerRemaining = remaining - 1;
            });
          }
        }, 1000);
      },

      clearSleepTimer: () => {
        if (sleepCountdownTimer) {
          clearInterval(sleepCountdownTimer);
          sleepCountdownTimer = null;
        }
        set((s) => {
          s.sleepTimerRemaining = null;
        });
      },

      stop: () => {
        const audio = getAudio();
        const state = get();
        saveProgress(state);
        flushCloudProgress(state.currentTime);
        endCloudProgress();
        audio.pause();
        audio.src = '';
        if (activeMedia) {
          youtubeMedia.pause();
          youtubeMedia.unload();
          activeMedia = null;
        }
        stopProgressSaving();
        get().clearSleepTimer();
        set((s) => {
          s.currentEpisode = null;
          s.currentFeed = null;
          s.isPlaying = false;
          s.currentTime = 0;
          s.duration = 0;
          s.abRepeat = null;
          s.activeSegmentIndex = -1;
        });
      },

      setActiveSegmentIndex: (index) => {
        set((s) => {
          s.activeSegmentIndex = index;
        });
      },

      toggleSubtitles: () => {
        set((s) => {
          s.subtitlesEnabled = !s.subtitlesEnabled;
        });
      },

      toggleFocusMode: () => {
        set((s) => {
          s.focusMode = !s.focusMode;
        });
      },

      setFontSize: (size) => {
        set((s) => {
          s.fontSize = size;
        });
      },

      setSubtitleBgOpacity: (opacity) => {
        set((s) => {
          s.subtitleBgOpacity = opacity;
        });
      },

      toggleAutoPauseOnBoundary: () => {
        set((s) => {
          s.autoPauseOnBoundary = !s.autoPauseOnBoundary;
        });
      },

      togglePauseOnHover: () => {
        set((s) => {
          s.pauseOnHover = !s.pauseOnHover;
        });
      },

      setSubtitleAlignment: (alignment) => {
        set((s) => {
          s.subtitleAlignment = alignment;
        });
      },

      recordWordClick: () => {
        set((s) => {
          s.wordsClicked += 1;
        });
      },

      recordWordAddedToDeck: () => {
        set((s) => {
          s.wordsAddedToDeck += 1;
        });
      },

      dismissCompleteOverlay: () => {
        set((s) => {
          s.showCompleteOverlay = false;
        });
      },

      // ── Internal ─────────────────────────────────────

      _onTimeUpdate: (time) => {
        const state = get();
        // A-B repeat logic
        if (state.abRepeat && time >= state.abRepeat.b) {
          const audio = getMedia();
          audio.currentTime = state.abRepeat.a;
          set((s) => {
            s.currentTime = state.abRepeat!.a;
          });
          return;
        }
        set((s) => {
          s.currentTime = time;
        });
        if (!progressSuppressed) reportCloudProgress(time, state.duration);
      },

      _onDurationChange: (dur) => {
        set((s) => {
          s.duration = dur;
        });
      },

      _onEnded: () => {
        const state = get();
        saveProgress(state);
        // A video is not an episode: no listening report; the overlay offers "Up next" instead.
        const isBook = isBookEpisode(state.currentEpisode);
        if (!isVideoEpisode(state.currentEpisode) && !isBook)
          reportCloudCompletion(state.currentTime);
        set((s) => {
          s.isPlaying = false;
          // A book track just stops; the next one is the reader's choice.
          s.showCompleteOverlay = !isBook;
        });
        stopProgressSaving();
      },
    };
  }),
);

// ── Preference Persistence ──────────────────────────────

function snapshotPrefs(s: PlayerState): PlayerPrefs {
  return {
    playbackRate: s.playbackRate,
    volume: s.volume,
    subtitlesEnabled: s.subtitlesEnabled,
    fontSize: s.fontSize,
    subtitleBgOpacity: s.subtitleBgOpacity,
    autoPauseOnBoundary: s.autoPauseOnBoundary,
    pauseOnHover: s.pauseOnHover,
    subtitleAlignment: s.subtitleAlignment,
  };
}

function prefsEqual(a: PlayerPrefs, b: PlayerPrefs): boolean {
  return (Object.keys(a) as (keyof PlayerPrefs)[]).every((k) => a[k] === b[k]);
}

// Hydrate from the local `settings` table, then keep it in sync. `focusMode` is
// deliberately NOT persisted — it's a per-session view mode, not a preference.
void loadPlayerPrefs().then((prefs) => {
  if (Object.keys(prefs).length === 0) return;
  usePlayerStore.setState((s) => {
    Object.assign(s, prefs);
  });
  const audio = getAudio();
  if (prefs.playbackRate != null) audio.playbackRate = prefs.playbackRate;
  if (prefs.volume != null) audio.volume = prefs.volume;
});

usePlayerStore.subscribe((state, prev) => {
  const next = snapshotPrefs(state);
  if (prefsEqual(next, snapshotPrefs(prev))) return;
  savePlayerPrefs(next);
});

// ── Progress Persistence ────────────────────────────────

function startProgressSaving(episodeId: string) {
  stopProgressSaving();
  const current = usePlayerStore.getState().currentEpisode;
  if (isVideoEpisode(current) || isBookEpisode(current)) return;
  progressSaveTimer = setInterval(() => {
    const state = usePlayerStore.getState();
    if (!progressSuppressed && state.currentEpisode?.id === episodeId) {
      const posMs = Math.round(state.currentTime * 1000);
      invoke('podcast_update_progress', {
        episodeId,
        position: posMs,
      }).catch(() => {});
    }
  }, 5000);
}

function stopProgressSaving() {
  if (progressSaveTimer) {
    clearInterval(progressSaveTimer);
    progressSaveTimer = null;
  }
}

function saveProgress(state: PlayerState) {
  if (progressSuppressed) return;
  // A video has no listening position to keep (it is a catalogue row, not a library episode).
  if (
    state.currentEpisode &&
    !isVideoEpisode(state.currentEpisode) &&
    !isBookEpisode(state.currentEpisode)
  ) {
    const posMs = Math.round(state.currentTime * 1000);
    invoke('podcast_update_progress', {
      episodeId: state.currentEpisode.id,
      position: posMs,
    }).catch(() => {});
  }
}
