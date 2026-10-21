import { invoke } from '@tauri-apps/api/core';
import type { ExamSectionDraft, SectionType } from '../types';

/**
 * Section drafts, so an exam in progress survives a crash or a force-quit.
 *
 * Front keeps these in `localStorage` under `exam_draft_{sessionId}_{section}`.
 * Desk stores the identical payload in SQLite instead: a desktop app can be
 * killed by the OS, and losing 40 minutes of a CELPIP exam is unacceptable.
 *
 * Timers are NOT stored as remaining-seconds. `sectionStartedAt` / `taskStartedAt`
 * are epoch milliseconds, and the countdown is recomputed from them on reload —
 * otherwise quitting the app would pause the clock.
 */

export async function saveDraft(
  sessionId: string,
  section: SectionType,
  draft: ExamSectionDraft,
): Promise<void> {
  try {
    await invoke('celpip_save_draft', {
      sessionId,
      section,
      payload: JSON.stringify(draft),
    });
  } catch {
    // A failed autosave must never interrupt the exam.
  }
}

export async function loadDraft(
  sessionId: string,
  section: SectionType,
): Promise<ExamSectionDraft | null> {
  try {
    const payload = await invoke<string | null>('celpip_load_draft', { sessionId, section });
    if (!payload) return null;
    return JSON.parse(payload) as ExamSectionDraft;
  } catch {
    return null;
  }
}

export async function clearDraft(sessionId: string, section: SectionType): Promise<void> {
  try {
    await invoke('celpip_clear_draft', { sessionId, section });
  } catch {
    /* nothing to recover from */
  }
}

/** Ending an exam early drops every section's draft at once. */
export async function clearAllDrafts(sessionId: string): Promise<void> {
  try {
    await invoke('celpip_clear_all_drafts', { sessionId });
  } catch {
    /* nothing to recover from */
  }
}

/** Seconds elapsed since an epoch-ms timestamp, floored at 0. */
export function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

/** Remaining seconds of a countdown that began at `startedAt`. */
export function remainingFrom(startedAt: number, limitSec: number): number {
  return Math.max(0, limitSec - elapsedSince(startedAt));
}
