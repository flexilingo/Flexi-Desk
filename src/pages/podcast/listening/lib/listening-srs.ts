/**
 * Spaced re-listen queue — SRS applied to audio clips instead of cards.
 *
 * Phase 1 writes to this silently (a failed loop, a missed dictation chunk, a
 * low confidence rating) and surfaces nothing, so that when the due-clips UI
 * lands in phase 2 it opens onto real data rather than an empty state.
 *
 * Intervals mirror the backend LeitnerStrategy EXACTLY
 * (flexi-lingo-core/functions/review-session/services/srs/leitner.ts), so
 * graduating this to the server later is a straight state copy rather than a
 * re-derivation.
 */

const STORAGE_KEY = 'flexilingo-listen-srs-v1';
const MAX_QUEUE = 60;

/** Leitner box -> days until the clip comes back. Same table as the backend. */
const BOX_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const;
const MAX_BOX = 5;

export type DueClipReason =
  | 'loop_failed'
  | 'dictation_missed'
  | 'decode_missed'
  | 'low_confidence'
  | 'manual';

export interface DueClip {
  /** `${videoId}:${startSec.toFixed(2)}` */
  id: string;
  videoId: string;
  feedId: string;
  title: string;
  image?: string;
  startSec: number;
  endSec: number;
  /** Denormalised so a due card renders without fetching the transcript. */
  text: string;
  box: 1 | 2 | 3 | 4 | 5;
  dueAt: number;
  addedAt: number;
  lastRating?: 1 | 2 | 3;
  reason: DueClipReason;
}

function readAll(): DueClip[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as DueClip[]) : [];
  } catch {
    return [];
  }
}

function writeAll(clips: DueClip[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clips));
  } catch {
    // Storage full or unavailable: progress simply is not persisted.
  }
}

function dueAtForBox(box: number): number {
  const days = BOX_INTERVAL_DAYS[Math.min(box, MAX_BOX) - 1] ?? 1;
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

export function clipId(videoId: string, startSec: number): string {
  return `${videoId}:${startSec.toFixed(2)}`;
}

/** Idempotent: re-failing a clip already in the queue does not duplicate it. */
export function enqueueClip(clip: Omit<DueClip, 'id' | 'box' | 'dueAt' | 'addedAt'>): void {
  const id = clipId(clip.videoId, clip.startSec);
  const all = readAll();
  if (all.some((c) => c.id === id)) return;

  const next: DueClip = {
    ...clip,
    id,
    box: 1,
    dueAt: dueAtForBox(1),
    addedAt: Date.now(),
  };

  const queue = [...all, next];
  if (queue.length > MAX_QUEUE) {
    // Evict the oldest box-1 entries first — the freshest failures matter most.
    queue.sort((a, b) => a.box - b.box || a.addedAt - b.addedAt);
    queue.splice(0, queue.length - MAX_QUEUE);
  }
  writeAll(queue);
}

/** 1 = Lost (box down), 2 = Half (same box), 3 = Got it (box up). Box 5 graduates out. */
export function rateClip(id: string, rating: 1 | 2 | 3): void {
  const all = readAll();
  const i = all.findIndex((c) => c.id === id);
  if (i < 0) return;

  const clip = all[i];
  const nextBox = rating === 3 ? clip.box + 1 : rating === 1 ? Math.max(1, clip.box - 1) : clip.box;

  if (nextBox > MAX_BOX) {
    all.splice(i, 1);
  } else {
    all[i] = {
      ...clip,
      box: nextBox as DueClip['box'],
      dueAt: dueAtForBox(nextBox),
      lastRating: rating,
    };
  }
  writeAll(all);
}

export function getDueClips(now = Date.now()): DueClip[] {
  return readAll()
    .filter((c) => c.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt);
}

export function getQueueSize(): number {
  return readAll().length;
}

export function removeClip(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id));
}
