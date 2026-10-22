import { useCallback, useEffect, useRef, useState } from 'react';
import type { SectionResult } from '../types';

const SKILL_ORDER = ['listening', 'reading', 'writing', 'speaking'] as const;
export type CompletionSkill = (typeof SKILL_ORDER)[number];
export type SectionScoringState = 'queued' | 'analyzing' | 'done' | 'failed';

const POLL_MS = 4000;
// Past this the page stops hurrying, but it never stops: the server scores the
// section on its own (exam?action=sweep_scoring, every minute), so the score
// will land whether or not this page is open — this only decides how soon the
// page shows it. Until 2026-09-30 polling stopped here for good and the page
// said "taking longer than expected", which read as "it failed".
const SLOW_AFTER_MS = 5 * 60 * 1000;
const SLOW_POLL_MS = 20_000;

interface CompletionPoll {
  sectionStates: Partial<Record<CompletionSkill, SectionScoringState>>;
  progress: { done: number; total: number };
  /** Waiting longer than usual — still polling, only less often. */
  stalled: boolean;
  retry: () => void;
}

/**
 * Polls get_results while any taken section isn't done yet. Unlike
 * useStagedInsight there's nothing client-owned to re-fire — this purely
 * observes the server, which self-heals + finalizes on every get_results
 * call (see exam-completion.ts). retry() just resets the stall clock and
 * resumes polling, trusting the next server call to make progress.
 */
export function useExamCompletionPoll(
  enabled: boolean,
  sectionResults: SectionResult[],
  refetch: () => void,
): CompletionPoll {
  const [stalled, setStalled] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const takenSkills = SKILL_ORDER.filter((s) => sectionResults.some((r) => r.section_type === s));
  const sectionStates: Partial<Record<CompletionSkill, SectionScoringState>> = {};
  for (const skill of takenSkills) {
    const row = sectionResults.find((r) => r.section_type === skill);
    sectionStates[skill] = row?.scoring_state ?? (row?.status === 'scored' ? 'done' : 'queued');
  }
  const anyNonTerminal = takenSkills.some(
    (s) => sectionStates[s] === 'queued' || sectionStates[s] === 'analyzing',
  );

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !anyNonTerminal) {
      stopPolling();
      return;
    }
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    if (pollTimer.current) return;
    const schedule = () => {
      const slow = Date.now() - (startedAtRef.current ?? Date.now()) > SLOW_AFTER_MS;
      if (slow) setStalled(true);
      pollTimer.current = setTimeout(
        () => {
          pollTimer.current = null;
          refetchRef.current();
          schedule();
        },
        slow ? SLOW_POLL_MS : POLL_MS,
      );
    };
    schedule();
  }, [enabled, anyNonTerminal, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const retry = useCallback(() => {
    startedAtRef.current = Date.now();
    setStalled(false);
    refetchRef.current();
  }, []);

  const done = takenSkills.filter((s) => sectionStates[s] === 'done').length;

  return {
    sectionStates,
    progress: { done, total: takenSkills.length },
    stalled,
    retry,
  };
}
