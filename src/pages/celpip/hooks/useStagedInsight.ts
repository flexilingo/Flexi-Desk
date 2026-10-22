import { useCallback, useEffect, useRef, useState } from 'react';
import type { InsightProvider } from './insightProviders';
import type { ExamInsight, InsightSkill, InsightSkillState } from '../types';

const SKILL_ORDER: InsightSkill[] = ['listening', 'reading', 'writing', 'speaking'];
const TERMINAL: InsightSkillState[] = [
  'ready',
  'unavailable',
  'error',
  'limit_reached',
  'not_taken',
];

const POLL_MS = 4000;

interface StagedInsight {
  /** Combined server + client state for a skill (or 'summary'). */
  skillState: (skill: InsightSkill) => InsightSkillState;
  insight: Partial<ExamInsight>;
  /** Taken skills whose insight is terminal, out of all taken skills. */
  progress: { done: number; total: number };
  isStatusLoading: boolean;
  limitReached: boolean;
  retry: (skill: InsightSkill) => void;
  origin: InsightProvider['origin'];
}

/**
 * Orchestrates staged per-skill insight generation. Ported from front's
 * `useStagedInsight`, with RTK Query swapped for an `InsightProvider` so the
 * exact same algorithm drives FlexiLingo's insight (Pro) and the on-device
 * model's (everyone else).
 *
 * One generation request at a time: the skill tab you're looking at jumps the
 * queue, then the default order (MCQ skills first — single-call and fastest),
 * then the summary once every taken skill is terminal. A 202 from the cloud
 * means another client claimed the work, so we fall back to polling status.
 */
export function useStagedInsight(
  provider: InsightProvider,
  enabled: boolean,
  activeTab: string,
): StagedInsight {
  const [status, setStatus] = useState<Awaited<ReturnType<InsightProvider['fetchStatus']>> | null>(
    null,
  );
  const [isStatusLoading, setIsStatusLoading] = useState(false);
  const [localStates, setLocalStates] = useState<Partial<Record<InsightSkill, InsightSkillState>>>(
    {},
  );
  const [limitReached, setLimitReached] = useState(false);

  const inFlightRef = useRef<InsightSkill | null>(null);
  const summaryRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summary409Count = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Providers are rebuilt on render; hold the latest without re-firing effects.
  const providerRef = useRef(provider);
  providerRef.current = provider;

  const refetchStatus = useCallback(async () => {
    try {
      setStatus(await providerRef.current.fetchStatus());
    } catch {
      // A failed status read must not wipe what we already know.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsStatusLoading(true);
    providerRef.current
      .fetchStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, provider.origin]);

  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(() => void refetchStatus(), POLL_MS);
  }, [refetchStatus]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const skillState = useCallback(
    (skill: InsightSkill): InsightSkillState => {
      const server = status?.skills?.[skill] ?? 'pending';
      if (server === 'ready' || server === 'unavailable' || server === 'not_taken') return server;
      const local = localStates[skill];
      if (local) return local;
      if (limitReached && (server === 'pending' || server === 'error')) return 'limit_reached';
      return server;
    },
    [status, localStates, limitReached],
  );

  const clearLocal = (skill: InsightSkill) =>
    setLocalStates((prev) => {
      if (!(skill in prev)) return prev;
      const next = { ...prev };
      delete next[skill];
      return next;
    });

  const fire = useCallback(
    (skill: InsightSkill) => {
      inFlightRef.current = skill;
      setLocalStates((prev) => ({ ...prev, [skill]: 'generating' }));

      providerRef.current
        .generate(skill)
        .then((data) => {
          // 202: the work was claimed and runs detached — keep 'generating' and poll.
          if (!data || !('result' in data) || data.result === undefined) {
            startPolling();
            void refetchStatus();
            return;
          }
          clearLocal(skill);
          void refetchStatus();
        })
        .catch((err: { code?: string }) => {
          const code = err?.code;
          if (code === 'EXAM_INSIGHT_LIMIT_REACHED') {
            setLimitReached(true);
            clearLocal(skill);
          } else if (code === 'INSIGHT_GENERATING') {
            startPolling();
            void refetchStatus();
          } else if (code === 'INSIGHT_SUMMARY_NOT_READY') {
            // A skill may still be finishing. Retry a few times, then show an
            // error rather than spinning forever.
            summary409Count.current += 1;
            if (summary409Count.current > 3) {
              setLocalStates((prev) => ({ ...prev, summary: 'error' }));
              return;
            }
            startPolling();
            if (summaryRetryTimer.current) clearTimeout(summaryRetryTimer.current);
            summaryRetryTimer.current = setTimeout(() => clearLocal('summary'), 5000);
          } else {
            setLocalStates((prev) => ({ ...prev, [skill]: 'error' }));
          }
        })
        .finally(() => {
          inFlightRef.current = null;
          // Nudge the orchestration effect to dequeue the next skill.
          setLocalStates((prev) => ({ ...prev }));
        });
    },
    [startPolling, refetchStatus],
  );

  // Orchestration: one request in flight, viewed tab first, summary last.
  useEffect(() => {
    if (!enabled || !status || limitReached || inFlightRef.current) return;

    const taken = SKILL_ORDER.filter((s) => status.skills[s] !== 'not_taken');
    const queue: InsightSkill[] = [];
    if (taken.includes(activeTab as InsightSkill)) queue.push(activeTab as InsightSkill);
    for (const s of taken) if (!queue.includes(s)) queue.push(s);

    const next = queue.find((s) => skillState(s) === 'pending');
    const allSkillsTerminal = taken.every((s) => TERMINAL.includes(skillState(s)));
    const summaryDue = taken.length > 0 && allSkillsTerminal && skillState('summary') === 'pending';

    if (next || summaryDue) {
      const toFire: InsightSkill = next ?? 'summary';
      // Dispatch on a zero-timeout so setState stays out of the effect body and
      // a dependency change can cancel a stale dispatch.
      const timer = setTimeout(() => {
        if (!inFlightRef.current) fire(toFire);
      }, 0);
      return () => clearTimeout(timer);
    }

    // Nothing to do — poll only while something else is generating.
    const anyGenerating = Object.values(status.skills).some((s) => s === 'generating');
    if (anyGenerating) startPolling();
    else stopPolling();
  }, [
    enabled,
    status,
    activeTab,
    localStates,
    limitReached,
    skillState,
    fire,
    startPolling,
    stopPolling,
  ]);

  useEffect(
    () => () => {
      if (summaryRetryTimer.current) clearTimeout(summaryRetryTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
    },
    [],
  );

  const retry = useCallback((skill: InsightSkill) => {
    // 'pending' makes the orchestrator pick it up again; the provider's claim
    // clears any stored error.
    summary409Count.current = 0;
    setLocalStates((prev) => ({ ...prev, [skill]: 'pending' }));
  }, []);

  const takenSkills = SKILL_ORDER.filter((s) => status?.skills?.[s] !== 'not_taken');
  const done = status
    ? takenSkills.filter((s) => ['ready', 'unavailable'].includes(skillState(s))).length
    : 0;

  return {
    skillState,
    insight: status?.insight ?? {},
    progress: { done, total: takenSkills.length },
    isStatusLoading,
    limitReached,
    retry,
    origin: provider.origin,
  };
}
