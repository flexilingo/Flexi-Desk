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
import { clearAllDrafts } from '../services/examDraft';
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
          s.error = errorCodeOf(err);
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
          s.error = errorCodeOf(err);
        });
        return null;
      }
    },

    submit: async (payload) => {
      set((s) => {
        s.isSubmitting = true;
        s.error = null;
      });
      try {
        const res = await submitSection(payload);
        set((s) => {
          s.isSubmitting = false;
          if (s.detail) {
            // Keep the local copy in step so the engine advances immediately.
            Object.assign(s.detail.session, res.session);
            const idx = s.detail.section_results.findIndex(
              (r) => r.section_type === (payload.section_type as SectionType),
            );
            if (idx >= 0) {
              Object.assign(s.detail.section_results[idx], res.section_result);
            }
          }
        });
        return true;
      } catch (err) {
        set((s) => {
          s.isSubmitting = false;
          s.error = errorCodeOf(err);
        });
        return false;
      }
    },

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

export function getCelpipState() {
  return useCelpipStore.getState();
}
