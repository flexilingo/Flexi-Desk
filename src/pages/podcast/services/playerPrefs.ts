import { getSetting, setSetting } from '@/lib/tauri-bridge';

/**
 * Player preferences survive restarts.
 *
 * They used to live only in the Zustand store, so every relaunch reset playback
 * speed, volume, font size and the subtitle settings — annoying for a desktop app
 * people keep open for hours. They're persisted to the local `settings` table
 * (never the cloud: these are per-machine).
 */
export interface PlayerPrefs {
  playbackRate: number;
  volume: number;
  subtitlesEnabled: boolean;
  fontSize: number;
  contextLines: number | null;
  autoPauseOnBoundary: boolean;
  pauseOnHover: boolean;
}

const KEY = 'podcast_player_prefs';

const CONTEXT_LINES = [0, 1, 2, 3] as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Reads one pref defensively: a hand-edited or older settings row must not be
 * able to put the player into an unusable state (e.g. volume 0, font size 0).
 */
function coerce(raw: unknown): Partial<PlayerPrefs> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<PlayerPrefs> = {};

  if (typeof r.playbackRate === 'number' && Number.isFinite(r.playbackRate))
    out.playbackRate = clamp(r.playbackRate, 0.25, 4);
  if (typeof r.volume === 'number' && Number.isFinite(r.volume)) out.volume = clamp(r.volume, 0, 1);
  if (typeof r.subtitlesEnabled === 'boolean') out.subtitlesEnabled = r.subtitlesEnabled;
  if (typeof r.fontSize === 'number' && Number.isFinite(r.fontSize))
    out.fontSize = clamp(r.fontSize, 12, 72);
  if (
    r.contextLines === null ||
    CONTEXT_LINES.includes(r.contextLines as (typeof CONTEXT_LINES)[number])
  )
    out.contextLines = r.contextLines as number | null;
  if (typeof r.autoPauseOnBoundary === 'boolean') out.autoPauseOnBoundary = r.autoPauseOnBoundary;
  if (typeof r.pauseOnHover === 'boolean') out.pauseOnHover = r.pauseOnHover;

  return out;
}

export async function loadPlayerPrefs(): Promise<Partial<PlayerPrefs>> {
  try {
    const raw = await getSetting(KEY);
    if (!raw) return {};
    return coerce(JSON.parse(raw));
  } catch {
    // Corrupt row or DB not ready — fall back to the store's defaults.
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced: sliders (volume, font size) fire many changes per second. */
export function savePlayerPrefs(prefs: PlayerPrefs): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void setSetting(KEY, JSON.stringify(prefs)).catch(() => {});
  }, 400);
}
