import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  assembleExam,
  completeExam,
  getMySessions,
  getResults,
  getSession,
  startPractice,
  submitSection,
} from '../services/celpipCloud';
import { clearAllDrafts, clearDraft } from '../services/examDraft';
import { SubmitRetryQueue, classifySubmitError, type SubmitOutcome } from '../utils/submitRetry';
import type {
  AssembleExamPayload,
  ExamResults,
  ExamSession,
  ExamSessionDetail,
  SectionType,
  StartPracticePayload,
  SubmitSectionPayload,
} from '../types';

/**
 * CELPIP session state.
 *
 * The exam is a FlexiLingo service: this store never grades, scores or assembles
 * anything. It holds what the UI is currently showing and forwards every mutation
 * to the `/exam` edge function.
 */

/** `supabaseCall` rejects with a JSON string; pull the backend's error code out. */
export function errorCodeOf(err: unknown): string {
  const raw = String(err);
  try {
    const parsed = JSON.parse(raw.replace(/^Error:\s*/, '')) as { code?: string; error?: string };
    return parsed.code || parsed.error || 'UNKNOWN_ERROR';
  } catch {
    return /^[A-Z_]+$/.test(raw) ? raw : 'UNKNOWN_ERROR';
  }
}

/**
 * A request that never got an answer is named, not hidden behind UNKNOWN_ERROR:
 * on 10-05 one learner pressed Start six times in 20 s and none of the requests
 * arrived. `NETWORK_ERROR` is resolved through `errors.*` like any backend code.
 */
export function startErrorCodeOf(err: unknown): string {
  const code = errorCodeOf(err);
  if (code !== 'UNKNOWN_ERROR') return code;
  const outcome = classifySubmitError(
    err,
    typeof navigator === 'undefined' ? undefined : navigator.onLine,
  );
  return outcome.kind === 'offline' || outcome.kind === 'unreachable' ? 'NETWORK_ERROR' : code;
}

interface CelpipState {
  sessions: ExamSession[];
  isSessionsLoading: boolean;

  detail: ExamSessionDetail | null;
  isDetailLoading: boolean;

  results: ExamResults | null;
  isResultsLoading: boolean;

  isStarting: boolean;
  isSubmitting: boolean;
  isCompleting: boolean;

  /** A backend error CODE (SCREAMING_SNAKE_CASE), resolved via i18n. */
  error: string | null;
  /**
   * A submit that never reached the server is kept and sent again by itself; this
   * says why the page is waiting. The answers stay in the section's draft.
   */
  submitNotice: 'offline' | 'unreachable' | null;

  fetchSessions: (examType: string) => Promise<void>;
  fetchDetail: (sessionId: string) => Promise<void>;
  fetchResults: (sessionId: string) => Promise<void>;

  start: (payload: AssembleExamPayload) => Promise<string | null>;
  startPracticeSession: (payload: StartPracticePayload) => Promise<string | null>;

  submit: (payload: SubmitSectionPayload) => Promise<boolean>;
  complete: (sessionId: string, force?: boolean) => Promise<boolean>;

  clearError: () => void;
  clearDetail: () => void;
}

// ── Submitting a section when the connection comes and goes ──────────────────
//
// One request at a time. A submit that never got an answer keeps its payload and
// goes again by itself (backoff, back online, window back in view). The section's
// draft is cleared ONLY once the server holds the answers: sections used to clear
// it before submitting, so a submit lost offline plus a restart threw every
// answer away.

const submitWaiters: Array<(ok: boolean) => void> = [];
let queue: SubmitRetryQueue<SubmitSectionPayload> | null = null;

function settleWaiters(ok: boolean) {
  submitWaiters.splice(0).forEach((resolve) => resolve(ok));
}

async function attemptSubmit(payload: SubmitSectionPayload): Promise<SubmitOutcome> {
  try {
    const res = await submitSection(payload);
    // The server sends a section's content only once it is the current one, so
    // the merge below would leave the next section empty. Re-read the session
    // first (the web does the same through its ExamSession tag) and only then
    // let the engine advance. If the re-read fails the engine's content gate
    // keeps loading and fetches again.
    try {
      const fresh = await getSession(payload.session_id);
      if (fresh?.session && fresh.exam_set && useCelpipStore.getState().detail) {
        useCelpipStore.setState((st) => {
          st.detail = fresh;
        });
        return { kind: 'sent' };
      }
    } catch {
      /* fall through to the local merge */
    }
    useCelpipStore.setState((st) => {
      if (st.detail) {
        // Keep the local copy in step so the engine advances immediately.
        Object.assign(st.detail.session, res.session);
        const idx = st.detail.section_results.findIndex(
          (r) => r.section_type === (payload.section_type as SectionType),
        );
        if (idx >= 0) Object.assign(st.detail.section_results[idx], res.section_result);
      }
    });
    return { kind: 'sent' };
  } catch (err) {
    const outcome = classifySubmitError(
      err,
      typeof navigator === 'undefined' ? undefined : navigator.onLine,
    );
    // A refusal carries the backend's own code; keep it for the message.
    if (outcome.kind === 'rejected' && !outcome.code)
      return { kind: 'rejected', code: errorCodeOf(err) };
    return outcome;
  }
}

function onSubmitSettled(outcome: SubmitOutcome, payload: SubmitSectionPayload) {
  const set = useCelpipStore.setState;
  if (outcome.kind === 'sent' || outcome.kind === 'held') {
    void clearDraft(payload.session_id, payload.section_type as SectionType);
    set((st) => {
      st.isSubmitting = false;
      st.submitNotice = null;
    });
    // The server already holds this section (a reply was lost, or a second submit
    // raced the first): re-read the session so the exam moves on.
    if (outcome.kind === 'held') void useCelpipStore.getState().fetchDetail(payload.session_id);
    settleWaiters(true);
    return;
  }
  if (outcome.kind === 'offline' || outcome.kind === 'unreachable') {
    // Still waiting: the spinner stays, the page says why.
    set((st) => {
      st.submitNotice = outcome.kind;
    });
    return;
  }
  set((st) => {
    st.isSubmitting = false;
    st.submitNotice = null;
    st.error = outcome.code || 'UNKNOWN_ERROR';
  });
  settleWaiters(false);
}

function submitQueue(): SubmitRetryQueue<SubmitSectionPayload> {
  if (!queue) {
    queue = new SubmitRetryQueue<SubmitSectionPayload>({
      attempt: attemptSubmit,
      onSettled: onSubmitSettled,
    });
    if (typeof window !== 'undefined') {
      // Back online, or the window back in view: try at once instead of waiting out the pause.
      const retry = () => queue?.retryNow();
      window.addEventListener('online', retry);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') retry();
      });
    }
  }
  return queue;
}

export const useCelpipStore = create<CelpipState>()(
  immer((set) => ({
    sessions: [],
    isSessionsLoading: false,
    detail: null,
    isDetailLoading: false,
    results: null,
    isResultsLoading: false,
    isStarting: false,
    isSubmitting: false,
    isCompleting: false,
    error: null,
    submitNotice: null,

    fetchSessions: async (examType) => {
      set((s) => {
        s.isSessionsLoading = true;
      });
      try {
        const sessions = await getMySessions(examType);
        set((s) => {
          s.sessions = sessions ?? [];
          s.isSessionsLoading = false;
        });
      } catch (err) {
        set((s) => {
          s.sessions = [];
          s.isSessionsLoading = false;
          s.error = errorCodeOf(err);
        });
      }
    },

    fetchDetail: async (sessionId) => {
      set((s) => {
        s.isDetailLoading = true;
        s.error = null;
      });
      try {
        const detail = await getSession(sessionId);
        // The user can navigate away mid-request.
        set((s) => {
          s.detail = detail;
          s.isDetailLoading = false;
        });
      } catch (err) {
        set((s) => {
          s.isDetailLoading = false;
          s.error = errorCodeOf(err);
        });
      }
    },

    fetchResults: async (sessionId) => {
      set((s) => {
        s.isResultsLoading = true;
      });
      try {
        const results = await getResults(sessionId);
        set((s) => {
          // A 200 with an unexpected body must not become state the UI then
          // dereferences — that reads as a crash, not as "no results".
          s.results = results?.session ? results : null;
          s.isResultsLoading = false;
        });
      } catch (err) {
        set((s) => {
          s.isResultsLoading = false;
          s.error = errorCodeOf(err);
        });
      }
    },

    start: async (payload) => {
      set((s) => {
        s.isStarting = true;
        s.error = null;
      });
      try {
        const res = await assembleExam(payload);
        set((s) => {
          s.isStarting = false;
        });
        return res.session_id;
      } catch (err) {
        set((s) => {
          s.isStarting = false;
          s.error = startErrorCodeOf(err);
        });
        return null;
      }
    },

    startPracticeSession: async (payload) => {
      set((s) => {
        s.isStarting = true;
        s.error = null;
      });
      try {
        const res = await startPractice(payload);
        set((s) => {
          s.isStarting = false;
        });
        return res.session_id;
      } catch (err) {
        set((s) => {
          s.isStarting = false;
          s.error = startErrorCodeOf(err);
        });
        return null;
      }
    },

    submit: (payload) =>
      new Promise<boolean>((resolve) => {
        set((st) => {
          st.isSubmitting = true;
          st.error = null;
        });
        submitWaiters.push(resolve);
        submitQueue().submit(payload);
      }),

    complete: async (sessionId, force) => {
      set((s) => {
        s.isCompleting = true;
        s.error = null;
      });
      try {
        await completeExam(sessionId, force);
        await clearAllDrafts(sessionId);
        set((s) => {
          s.isCompleting = false;
          if (s.detail) s.detail.session.status = 'completed';
        });
        return true;
      } catch (err) {
        const code = errorCodeOf(err);
        // The exam is already finished — treat as success so the user still
        // reaches their results instead of being stuck on a dead screen.
        if (code === 'EXAM_ALREADY_COMPLETE') {
          await clearAllDrafts(sessionId);
          set((s) => {
            s.isCompleting = false;
          });
          return true;
        }
        set((s) => {
          s.isCompleting = false;
          s.error = code;
        });
        return false;
      }
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),

    clearDetail: () =>
      set((s) => {
        s.detail = null;
        s.results = null;
      }),
  })),
);

/** Sessions that count toward history and averages — front's exact filter. */
export function isRankedSession(session: ExamSession): boolean {
  return (
    session.status === 'completed' &&
    session.practice_config?.learning_mode !== true &&
    session.m_score != null
  );
}

/** Whether an unfinished session is still resumable (backend TTL is 4 hours). */
export function isResumable(session: ExamSession, ttlMs: number): boolean {
  if (session.status === 'completed') return false;
  // Learning mode is untimed, so it never expires.
  if (session.practice_config?.learning_mode === true) return true;
  const started = session.started_at ?? session.created_at;
  if (!started) return false;
  return Date.now() - new Date(started).getTime() < ttlMs;
}

/**
 * Is there still a section to sit? A session whose every section is submitted
 * stays `in_progress` until detached AI scoring finalizes it; offering "Resume"
 * for it (Section 5 of 4) in place of Start meant a learner could not begin
 * another test. A practice walks its own `sections_order`, not the canonical four.
 */
export function hasSectionLeft(session: ExamSession): boolean {
  const order = session.practice_config?.sections_order;
  return order && order.length > 0
    ? order.includes(session.current_section)
    : session.current_section < 4;
}

/** Every section submitted, the score still being made: neither resumable nor completed. */
export function isScoringSession(session: ExamSession): boolean {
  return session.status === 'in_progress' && !hasSectionLeft(session);
}

/** Where the learner is within the sections THIS session holds (practice carries only what was picked). */
export function sessionProgress(session: ExamSession): { current: number; total: number } {
  const order = session.practice_config?.sections_order;
  if (!order || order.length === 0) return { current: session.current_section + 1, total: 4 };
  const position = order.indexOf(session.current_section);
  return { current: (position >= 0 ? position : order.length - 1) + 1, total: order.length };
}

export function getCelpipState() {
  return useCelpipStore.getState();
}
