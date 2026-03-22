import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type { PodcastEpisode, PodcastFeed } from '../types';

// ── Singleton Audio Element ────────────────────────────

let audioEl: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
  return audioEl;
}

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
  showEstimatedOnSubtitles: boolean;

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
  toggleShowEstimated: () => void;

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
      set((s) => { s.isBuffering = true; });
    });

    audio.addEventListener('waiting', () => {
      set((s) => { s.isBuffering = true; });
    });

    audio.addEventListener('playing', () => {
      set((s) => { s.isBuffering = false; });
    });

    audio.addEventListener('canplay', () => {
      set((s) => { s.isBuffering = false; });
    });

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
      showEstimatedOnSubtitles: true,
      isBuffering: false,
      playError: null,
      wordsClicked: 0,
      wordsAddedToDeck: 0,
      activeTimeSpent: 0,
      showCompleteOverlay: false,

      play: (episode, feed) => {
        const audio = getAudio();
        const state = get();

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
        const audio = getAudio();
        audio.pause();
        set((s) => {
          s.isPlaying = false;
        });
        stopProgressSaving();
        saveProgress(get());
      },

      resume: () => {
        const audio = getAudio();
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
        const audio = getAudio();
        audio.currentTime = time;
        set((s) => {
          s.currentTime = time;
        });
      },

      setPlaybackRate: (rate) => {
        const audio = getAudio();
        audio.playbackRate = rate;
        set((s) => {
          s.playbackRate = rate;
        });
      },

      setVolume: (vol) => {
        const audio = getAudio();
        audio.volume = vol;
        set((s) => {
          s.volume = vol;
        });
      },

      skipForward: (seconds = 15) => {
        const audio = getAudio();
        audio.currentTime = Math.min(audio.currentTime + seconds, audio.duration || 0);
        set((s) => {
          s.currentTime = audio.currentTime;
        });
      },

      skipBack: (seconds = 15) => {
        const audio = getAudio();
        audio.currentTime = Math.max(audio.currentTime - seconds, 0);
        set((s) => {
          s.currentTime = audio.currentTime;
        });
      },

      setABRepeat: (a, b) => {
        set((s) => {
          s.abRepeat = { a, b };
        });
        const audio = getAudio();
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
        saveProgress(get());
        audio.pause();
        audio.src = '';
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

      toggleShowEstimated: () => {
        set((s) => {
          s.showEstimatedOnSubtitles = !s.showEstimatedOnSubtitles;
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
          const audio = getAudio();
          audio.currentTime = state.abRepeat.a;
          set((s) => {
            s.currentTime = state.abRepeat!.a;
          });
          return;
        }
        set((s) => {
          s.currentTime = time;
        });
      },

      _onDurationChange: (dur) => {
        set((s) => {
          s.duration = dur;
        });
      },

      _onEnded: () => {
        saveProgress(get());
        set((s) => {
          s.isPlaying = false;
          s.showCompleteOverlay = true;
        });
        stopProgressSaving();
      },
    };
  }),
);

// ── Progress Persistence ────────────────────────────────

function startProgressSaving(episodeId: string) {
  stopProgressSaving();
  progressSaveTimer = setInterval(() => {
    const state = usePlayerStore.getState();
    if (state.currentEpisode?.id === episodeId) {
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
  if (state.currentEpisode) {
    const posMs = Math.round(state.currentTime * 1000);
    invoke('podcast_update_progress', {
      episodeId: state.currentEpisode.id,
      position: posMs,
    }).catch(() => {});
  }
}
