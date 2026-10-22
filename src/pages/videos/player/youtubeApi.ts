// Minimal typings + loader for the YouTube IFrame Player API (the surface the player touches).

export interface YTPlayer {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  /** -1 unstarted | 0 ended | 1 playing | 2 paused | 3 buffering | 5 cued */
  getPlayerState: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void; // 0–100
  getVolume: () => number; // 0–100
  /** Undocumented but long-standing: removes YouTube's own captions (ours are the captions). */
  unloadModule?: (module: string) => void;
}

export interface YTEvents {
  onReady?: (event: { target: YTPlayer }) => void;
  onStateChange?: (event: { data: number; target: YTPlayer }) => void;
  onApiChange?: (event: { target: YTPlayer }) => void;
  onError?: (event: { data: number; target: YTPlayer }) => void;
}

export interface YTGlobal {
  Player: new (el: HTMLElement | string, config: { events?: YTEvents }) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loaderPromise: Promise<YTGlobal> | null = null;

/** A network that blocks YouTube can also just never answer. */
export const LOAD_TIMEOUT_MS = 20_000;

/**
 * Loads the IFrame API script once per session and resolves when window.YT is ready. A failed load
 * is forgotten, so the next call tries again (the website kept the rejection and every video after
 * the first got it until a full reload).
 */
export function loadYouTubeIframeApi(): Promise<YTGlobal> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<YTGlobal>((resolve, reject) => {
    const tag = document.createElement('script');
    const fail = (message: string) => {
      window.clearTimeout(timer);
      loaderPromise = null;
      tag.remove();
      reject(new Error(message));
    };
    const timer = window.setTimeout(() => fail('YouTube iframe API timed out'), LOAD_TIMEOUT_MS);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        previous?.();
      } catch {
        /* ignore */
      }
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else fail('YT.Player did not load');
    };

    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => fail('Failed to load YouTube iframe API');
    document.head.appendChild(tag);
  });

  return loaderPromise;
}
