/**
 * The OS media controls (media keys, Now Playing, lock screen) for the podcast player. The session
 * object is passed in so the handler wiring is testable without a webview.
 */

/** A media key with no distance in it moves this far. */
export const DEFAULT_SEEK_SECONDS = 10;

export interface MediaSessionControls {
  play: () => void;
  pause: () => void;
  skip: (seconds: number) => void;
  seekTo: (time: number) => void;
  /** Previous/next media key: a line at a time, when the player registered the steppers. */
  prevLine?: () => void;
  nextLine?: () => void;
}

export interface MediaSessionLike {
  metadata: unknown;
  playbackState: string;
  setActionHandler: (
    action: string,
    handler: ((details: Record<string, number | undefined>) => void) | null,
  ) => void;
  setPositionState?: (state?: { duration: number; playbackRate: number; position: number }) => void;
}

/** Registers every handler; browsers throw on actions they do not implement, so each is guarded. Returns the cleanup. */
export function registerMediaHandlers(
  session: MediaSessionLike,
  c: MediaSessionControls,
): () => void {
  const handlers: [string, (d: Record<string, number | undefined>) => void][] = [
    ['play', () => c.play()],
    ['pause', () => c.pause()],
    ['stop', () => c.pause()],
    ['seekbackward', (d) => c.skip(-(d.seekOffset ?? DEFAULT_SEEK_SECONDS))],
    ['seekforward', (d) => c.skip(d.seekOffset ?? DEFAULT_SEEK_SECONDS)],
    [
      'seekto',
      (d) => {
        if (d.seekTime != null) c.seekTo(d.seekTime);
      },
    ],
  ];
  if (c.prevLine) handlers.push(['previoustrack', () => c.prevLine?.()]);
  if (c.nextLine) handlers.push(['nexttrack', () => c.nextLine?.()]);
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      /* not implemented here */
    }
  }
  return () => {
    for (const [action] of handlers) {
      try {
        session.setActionHandler(action, null);
      } catch {
        /* not implemented here */
      }
    }
  };
}

/** The lock-screen progress bar; skipped until the duration is real. */
export function pushPositionState(
  session: MediaSessionLike,
  s: { duration: number; position: number; rate: number },
): boolean {
  if (!session.setPositionState || !Number.isFinite(s.duration) || s.duration <= 0) return false;
  try {
    session.setPositionState({
      duration: s.duration,
      playbackRate: s.rate || 1,
      position: Math.min(Math.max(s.position, 0), s.duration),
    });
    return true;
  } catch {
    return false;
  }
}

export const mediaPlaybackState = (
  hasEpisode: boolean,
  playing: boolean,
): 'none' | 'playing' | 'paused' => (hasEpisode ? (playing ? 'playing' : 'paused') : 'none');

/** The registry the player view fills so the previous/next media keys step lines. */
let lineSteppers: { prevLine: () => void; nextLine: () => void } | null = null;
export const setLineSteppers = (s: typeof lineSteppers) => {
  lineSteppers = s;
};
export const getLineSteppers = () => lineSteppers;
