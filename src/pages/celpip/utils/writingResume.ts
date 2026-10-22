import type { ExamSectionDraft } from '../types';

/**
 * Coming back to a Writing section that was left half-way (front `writingResume.ts`).
 *
 * The section opens straight from the draft (task, answers and clock). A practice
 * only counts the time actually spent on the task, as Listening does; a full
 * sitting keeps the wall clock, as the real test does. Nothing here ever submits:
 * an empty reopened page is never handed in by a clock check.
 */

export interface WritingTaskClock {
  time_limit_minutes: number;
}

export interface RestoredWriting {
  taskIndex: number;
  answers: Record<string, string>;
  /** Seconds left on the current task's clock. */
  timeLeft: number;
  /** Seconds the current task's clock has run (practice: carried over). */
  activeSec: number;
}

/** CELPIP Writing: one clock per task. */
export function restoreWriting(
  draft: Pick<
    ExamSectionDraft,
    'taskIndex' | 'answers' | 'taskStartedAt' | 'sectionStartedAt' | 'activeSec'
  > | null,
  tasks: readonly WritingTaskClock[],
  pauseWhileAway: boolean,
  now: number,
): RestoredWriting {
  const last = Math.max(0, tasks.length - 1);
  const taskIndex = Math.min(Math.max(0, draft?.taskIndex ?? 0), last);
  const limit = Math.max(0, (tasks[taskIndex]?.time_limit_minutes ?? 0) * 60);
  const answers = (draft?.answers as Record<string, string> | undefined) ?? {};
  if (!draft) return { taskIndex, answers, timeLeft: limit, activeSec: 0 };

  // Practice: only the time actually spent on this task counts.
  if (pauseWhileAway && typeof draft.activeSec === 'number') {
    const ran = Math.min(limit, Math.max(0, Math.floor(draft.activeSec)));
    return { taskIndex, answers, timeLeft: limit - ran, activeSec: ran };
  }
  // A full sitting (and drafts saved before activeSec existed): the wall clock since this task began.
  const startedAt = draft.taskStartedAt ?? draft.sectionStartedAt;
  if (startedAt) {
    const ran = Math.min(limit, Math.max(0, Math.floor((now - startedAt) / 1000)));
    return { taskIndex, answers, timeLeft: limit - ran, activeSec: ran };
  }
  return { taskIndex, answers, timeLeft: limit, activeSec: 0 };
}
