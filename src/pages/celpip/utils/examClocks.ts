import type { ExamSectionDraft } from '../types';

/**
 * Section clocks for the TCF family, ported from flexi-lingo-front
 * `utils/tcfListeningClock.ts` and `utils/listeningResume.ts`.
 *
 * TCF Compréhension orale: the 39 recordings last about 29 minutes in total, so
 * a clock that ran during playback left four minutes to answer 39 questions
 * (24 of 24 full web sittings ran out). The candidate moves on with Next, so the
 * clock STANDS STILL while an item's recording is due or playing and runs only
 * while they answer after it. Time with the app closed still counts, as it
 * would in a test centre.
 */

export interface TcfClock {
  /** Epoch ms the section opened. */
  startedAt: number;
  /** Ms the clock stood still because a recording was due or playing. */
  pausedMs: number;
  /** Epoch ms up to which time has been accounted. */
  lastAt: number;
}

/** The clock when the section opens, from the saved draft if there is one. */
export function restoreTcfClock(
  draft: { sectionStartedAt?: number; pausedSec?: number } | null,
  now: number,
): TcfClock {
  const startedAt = draft?.sectionStartedAt || now;
  const paused =
    typeof draft?.pausedSec === 'number' && draft.pausedSec > 0 ? draft.pausedSec * 1000 : 0;
  return { startedAt, pausedMs: paused, lastAt: Math.max(now, startedAt) };
}

/** Account the time since the last call, measured from timestamps (a throttled tab still credits every second). */
export function accrueTcfClock(clock: TcfClock, now: number, recordingPhase: boolean): TcfClock {
  if (now <= clock.lastAt) return clock;
  const delta = now - clock.lastAt;
  return {
    ...clock,
    pausedMs: recordingPhase ? clock.pausedMs + delta : clock.pausedMs,
    lastAt: now,
  };
}

/** Seconds left, as of the last accounted moment. */
export function tcfTimeLeft(clock: TcfClock, limitSec: number): number {
  const ranMs = Math.max(0, clock.lastAt - clock.startedAt - clock.pausedMs);
  return Math.max(0, limitSec - Math.floor(ranMs / 1000));
}

/** Rewind a little on resume so the sentence that was cut off makes sense. */
const RESUME_REWIND_SEC = 2;

/** Seconds left on a section clock when the section opens. */
export function initialTimeLeft(
  draft: Pick<ExamSectionDraft, 'sectionStartedAt' | 'activeSec' | 'pausedSec'> | null,
  limitSec: number,
  pauseWhileAway: boolean,
  now: number,
): number {
  if (!draft) return limitSec;
  // Practice: only the time actually spent in the section counts.
  if (pauseWhileAway && typeof draft.activeSec === 'number') {
    return Math.max(0, limitSec - Math.floor(draft.activeSec));
  }
  // A full sitting (and drafts saved before activeSec existed): the wall clock.
  if (draft.sectionStartedAt) {
    const paused = typeof draft.pausedSec === 'number' && draft.pausedSec > 0 ? draft.pausedSec : 0;
    return Math.max(
      0,
      Math.min(limitSec, limitSec - Math.floor((now - draft.sectionStartedAt) / 1000 - paused)),
    );
  }
  return limitSec;
}

/** Where the audio of the item the draft stopped on stands. */
export function resumeAudio(draft: Pick<ExamSectionDraft, 'partIndex' | 'audio'> | null): {
  startAt: number;
  done: boolean;
} {
  const audio = draft?.audio;
  if (!draft || !audio || audio.partIndex !== draft.partIndex) return { startAt: 0, done: false };
  if (audio.done) return { startAt: 0, done: true };
  return { startAt: Math.max(0, audio.pos - RESUME_REWIND_SEC), done: false };
}

export function formatClock(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** The fields a TCF item carries beyond the shared part shape. */
export interface TcfItemMeta {
  level: string | null;
  context?: string;
  document?: string;
  documentKind?: string;
  title?: string;
}

export function itemContent(part: object): TcfItemMeta {
  const p = part as Record<string, unknown>;
  const level = typeof p.level === 'string' && CEFR.includes(p.level) ? p.level : null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  return {
    level,
    context: str(p.context),
    document: str(p.document),
    documentKind: str(p.document_kind),
    title: str(p.title),
  };
}
