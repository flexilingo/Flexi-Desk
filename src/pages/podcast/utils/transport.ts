/**
 * Player transport logic shared by the keyboard, the control bar and the OS media keys.
 * Pure on purpose: the website's player has the same rules (line stepping, the 1.5 s restart rule,
 * the transport key map) and they are tested here without a DOM.
 */

/** A subtitle line in PLAYER time (segment time plus the sync offset), in seconds. */
export interface StepLine {
  start: number;
  end: number;
}

/** The line the last previous/next press went to. Any other seek clears it. */
export interface LastStep {
  index: number;
  /** performance.now() of the press, in ms. */
  at: number;
  episodeId: string | null;
}

/** Just started a line (less than this in): previous goes to the line before, not back to its start. */
export const RESTART_WINDOW_SEC = 1.5;
/** A press within this of the last one counts from the line it went to, not from the clock. */
export const RECENT_STEP_MS = 1500;
/** Where there is no line to step to the buttons and arrows move this far. */
export const FALLBACK_SKIP_SEC = 5;
export const JUMP_SEC = 10;
export const VOLUME_STEP = 0.05;

export type StepResult = { kind: 'line'; index: number } | { kind: 'skip'; seconds: number };

interface StepInput {
  lines: StepLine[];
  /** The current playback time in player time. */
  time: number;
  /** Index of the line playing now (-1 between lines). */
  activeIndex: number;
  last: LastStep | null;
  episodeId: string | null;
  /** performance.now(). */
  nowMs: number;
}

export function recentStepIndex(
  i: Pick<StepInput, 'lines' | 'last' | 'episodeId' | 'nowMs'>,
): number | null {
  const { last } = i;
  if (!last || last.episodeId !== i.episodeId) return null;
  if (i.nowMs - last.at >= RECENT_STEP_MS) return null;
  return i.lines[last.index] ? last.index : null;
}

/** Index of the line playing at `time`, or -1. */
export function lineIndexAt(lines: StepLine[], time: number): number {
  return lines.findIndex((l) => time >= l.start && time < l.end);
}

/** Previous line: well into a line = hear it again, just started it = the one before. */
export function prevLineStep(i: StepInput): StepResult {
  const recent = recentStepIndex(i);
  if (recent !== null && i.time < i.lines[recent].end) {
    return { kind: 'line', index: Math.max(0, recent - 1) };
  }
  const idx = i.activeIndex;
  if (idx < 0) return { kind: 'skip', seconds: -FALLBACK_SKIP_SEC };
  const justStarted = idx > 0 && i.time - i.lines[idx].start < RESTART_WINDOW_SEC;
  return { kind: 'line', index: justStarted ? idx - 1 : idx };
}

/** Next line: the first one that starts after now, never behind the line just stepped to. */
export function nextLineStep(i: StepInput): StepResult {
  const byClock = i.lines.findIndex((l) => l.start > i.time + 0.05);
  const recent = recentStepIndex(i);
  const idx = recent !== null ? Math.max(recent + 1, byClock < 0 ? recent + 1 : byClock) : byClock;
  if (idx < 0 || idx >= i.lines.length) return { kind: 'skip', seconds: FALLBACK_SKIP_SEC };
  return { kind: 'line', index: idx };
}

// ── Keyboard map ────────────────────────────────────────

export type TransportAction =
  | 'togglePlay'
  | 'prevLine'
  | 'nextLine'
  | 'back10'
  | 'forward10'
  | 'mute'
  | 'volumeUp'
  | 'volumeDown'
  | 'bookmark'
  | 'pip';

interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Space/K play, left/right previous/next line, J/L +-10 s, M mute, up/down volume, B bookmark, P PiP.
 * Ctrl/Cmd/Alt combos belong to the OS and are never taken.
 */
export function transportAction(e: KeyLike, opts: { volumeKeys: boolean }): TransportAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case ' ':
    case 'k':
    case 'K':
      return 'togglePlay';
    case 'ArrowLeft':
      return 'prevLine';
    case 'ArrowRight':
      return 'nextLine';
    case 'ArrowUp':
      return opts.volumeKeys ? 'volumeUp' : null;
    case 'ArrowDown':
      return opts.volumeKeys ? 'volumeDown' : null;
    case 'j':
    case 'J':
      return 'back10';
    case 'l':
    case 'L':
      return 'forward10';
    case 'm':
    case 'M':
      return 'mute';
    case 'b':
    case 'B':
      return 'bookmark';
    case 'p':
    case 'P':
      return 'pip';
    default:
      return null;
  }
}

/** Volume moved one step, clamped to 0-1 and rounded to whole percents (the audio element throws outside 0-1). */
export function stepVolume(volume: number, direction: 1 | -1): number {
  return Math.round(Math.max(0, Math.min(1, volume + direction * VOLUME_STEP)) * 100) / 100;
}

/** True when the key press came from a field the listener is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
}

/** `?t=` (a search moment) or `?resume=` (the history tab): the second to start at, or null. */
export function parseStartAt(sp: Pick<URLSearchParams, 'get'>): number | null {
  for (const key of ['t', 'resume']) {
    const raw = sp.get(key);
    if (raw === null) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

/**
 * A player route with the second to start at. The Notes page uses it: the player honours `?t=` even
 * when that same episode is already loaded or playing (it seeks instead of ignoring the request).
 */
export function withSeekParam(route: string, seconds: number | null | undefined): string {
  if (
    seconds == null ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    !route.includes('/podcast/player/')
  )
    return route;
  const [path, query = ''] = route.split('?');
  const sp = new URLSearchParams(query);
  sp.set('t', String(Math.floor(seconds)));
  return `${path}?${sp.toString()}`;
}

/**
 * Whether the player should jump to `?t=` now. Keyed by episode AND second: the same episode already
 * loaded or playing is sought when a note asks for another second, but a re-render never repeats it.
 */
export function startRequestKey(
  last: string | null,
  episodeId: string,
  startAt: number | null,
): { apply: boolean; key: string | null } {
  if (startAt === null) return { apply: false, key: last };
  const key = `${episodeId}:${startAt}`;
  return { apply: key !== last, key };
}
