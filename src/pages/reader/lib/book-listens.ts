/**
 * The pure parts of a book track in the player: where a half-heard pass is kept,
 * how a finished pass is reported, and where the line steps land.
 *
 * Ported 1:1 from the website (`useBookTrack.ts`), pulled out of the hooks so the
 * rules can be tested without a player. The hooks (`use-book-track.ts`) only wire
 * these to the audio element.
 */

/** How far each track has been heard without a gap, so a restart does not lose a half-heard pass. */
export const PROGRESS_KEY = 'flexi-book-listen-progress';
export const PROGRESS_KEEP = 40;
/** A lost report is tried again after these waits; the server never counts the same pass twice. */
export const RETRY_MS = [5_000, 30_000] as const;
/** How long the last line stays up after it has been said. */
export const LAST_LINE_HOLD = 3;
/** Further into a line than this, "previous" means this line again. */
export const RESTART_LINE_WITHIN = 1.5;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const defaultStore = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

function readAll(store: Store | null): Record<string, number> {
  try {
    return JSON.parse(store?.getItem(PROGRESS_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function loadProgress(id: string, store: Store | null = defaultStore()): number {
  const value = readAll(store)[id];
  return typeof value === 'number' ? value : 0;
}

export function saveProgress(
  id: string,
  heardTo: number,
  store: Store | null = defaultStore(),
): void {
  if (!store) return;
  try {
    const all = readAll(store);
    delete all[id];
    if (heardTo > 0) all[id] = Math.round(heardTo * 100) / 100;
    // Newest last; the oldest half-heard tracks fall off.
    const kept = Object.entries(all).slice(-PROGRESS_KEEP);
    store.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Private mode / quota: the pass still counts within this session.
  }
}

/**
 * Report one full listen, and again after 5 s and 30 s if the answer was lost.
 * `schedule` is injectable for tests.
 */
export function reportListen(
  send: () => Promise<unknown>,
  schedule: (run: () => void, ms: number) => unknown = setTimeout,
  attempt = 0,
): void {
  send().catch(() => {
    if (attempt < RETRY_MS.length)
      schedule(() => reportListen(send, schedule, attempt + 1), RETRY_MS[attempt]);
  });
}

export interface TimedLine {
  start: number;
  end?: number;
}

/**
 * Where "previous line" goes: well into a line it is that line again, just after
 * it starts it is the one before. Null before the first line (the bar keeps -5 s).
 */
export function prevLineTarget(lines: TimedLine[], at: number): number | null {
  let i = -1;
  for (let k = 0; k < lines.length && lines[k].start <= at + 0.05; k++) i = k;
  if (i < 0) return null;
  return lines[i > 0 && at - lines[i].start < RESTART_LINE_WITHIN ? i - 1 : i].start + 0.01;
}

/** Where "next line" goes; null after the last line (the bar keeps +5 s). */
export function nextLineTarget(lines: TimedLine[], at: number): number | null {
  const next = lines.find((line) => line.start > at + 0.05);
  return next ? next.start + 0.01 : null;
}

/**
 * The line on screen: it stays up until the next one starts. Book recordings pause
 * between lines on purpose ("listen and repeat"), and a bar that emptied in every
 * pause would jump while the learner repeats. The last line goes after a hold.
 */
export function activeLineIndex(segments: TimedLine[], time: number): number {
  let index = -1;
  for (let i = 0; i < segments.length && segments[i].start <= time; i++) index = i;
  const last = segments[index];
  if (index === segments.length - 1 && last && time > (last.end ?? last.start) + LAST_LINE_HOLD)
    return -1;
  return index;
}
