/**
 * Program run persistence. Mirrors miniPlayerPersistence.ts: versioned key,
 * try/catch everywhere, hard expiry.
 *
 * `steps[]` is NOT persisted — it is recomputable from
 * compileProgram(def, window, segments), which keeps the record tiny and
 * tolerant of definition edits between sessions.
 *
 * Resume is OFFERED, never automatic: auto-resuming would auto-seek on page
 * load, which is exactly the "normal playback is unchanged" rule being broken.
 */

import type { ClipRange, PlaybackSnapshot, ProgramRunMode, StepAnswer } from '../types';

const STORAGE_KEY = 'flexilingo-listening-program';
/** A drill is a sitting, not a week. */
const EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface PersistedProgram {
  v: 1;
  videoId: string;
  definitionId: string;
  runMode: ProgramRunMode;
  window: ClipRange;
  stepIndex: number;
  totalSteps: number;
  answers: Record<string, StepAnswer>;
  cycle: { index: number; nextTriggerAt: number; windowSec: number } | null;
  snapshot: PlaybackSnapshot;
  savedAt: number;
}

export function savePersistedProgram(data: PersistedProgram): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable: progress simply is not persisted.
  }
}

export function loadPersistedProgram(videoId: string): PersistedProgram | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedProgram;
    if (data.v !== 1 || data.videoId !== videoId) return null;
    if (Date.now() - data.savedAt > EXPIRY_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // A finished run is not resumable.
    if (data.stepIndex >= data.totalSteps) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearPersistedProgram(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage full or unavailable: progress simply is not persisted.
  }
}
