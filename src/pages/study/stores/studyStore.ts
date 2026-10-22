// =============================================================================
// Study store — Zustand + Immer wrapper over the local study_* Tauri commands.
// Mirrors the front's practiceSessionApi hooks; all backend logic runs locally.
// =============================================================================

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type {
  SessionCard,
  DailyPlan,
  DeckStatus,
  NextActivityResponse,
  PracticeConfig,
  PracticeSession,
  SessionSummaryResponse,
  StartSessionArgs,
  SubmitActivityBody,
  SubmitResponse,
  UpdateConfigBody,
} from '../types';

interface StudyState {
  // Landing data
  config: PracticeConfig | null;
  dailyPlan: DailyPlan | null;
  deckStatus: DeckStatus[];
  loadingConfig: boolean;
  loadingPlan: boolean;
  loadingDecks: boolean;
  savingConfig: boolean;
  error: string | null;

  // Session runner state
  session: PracticeSession | null;
  current: NextActivityResponse | null;
  starting: boolean;
  advancing: boolean;
  submitting: boolean;

  // Actions
  fetchConfig: () => Promise<void>;
  updateConfig: (patch: UpdateConfigBody) => Promise<void>;
  fetchDailyPlan: () => Promise<void>;
  regeneratePlan: () => Promise<void>;
  fetchDeckStatus: () => Promise<void>;
  /** Starts a session; returns its id on success, or null (error set) on failure/empty. */
  startSession: (args?: StartSessionArgs) => Promise<string | null>;
  nextActivity: (sessionId: string) => Promise<NextActivityResponse | null>;
  submitActivity: (body: SubmitActivityBody) => Promise<SubmitResponse | null>;
  endSession: (sessionId: string, abandoned?: boolean) => Promise<SessionSummaryResponse | null>;
  clearError: () => void;
  resetRunner: () => void;
}

function errMsg(e: unknown): string {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
}

export const useStudyStore = create<StudyState>()(
  immer((set, get) => ({
    config: null,
    dailyPlan: null,
    deckStatus: [],
    loadingConfig: false,
    loadingPlan: false,
    loadingDecks: false,
    savingConfig: false,
    error: null,

    session: null,
    current: null,
    starting: false,
    advancing: false,
    submitting: false,

    fetchConfig: async () => {
      set((s) => {
        s.loadingConfig = true;
      });
      try {
        const res = await invoke<{ config: PracticeConfig }>('study_get_config');
        set((s) => {
          s.config = res.config;
          s.loadingConfig = false;
        });
      } catch (e) {
        set((s) => {
          s.error = errMsg(e);
          s.loadingConfig = false;
        });
      }
    },

    updateConfig: async (patch) => {
      set((s) => {
        s.savingConfig = true;
        s.error = null;
      });
      try {
        const res = await invoke<{ config: PracticeConfig }>('study_update_config', { patch });
        set((s) => {
          s.config = res.config;
          s.savingConfig = false;
        });
        // Config changes may invalidate the plan — refresh it in the background.
        get().fetchDailyPlan();
      } catch (e) {
        set((s) => {
          s.error = errMsg(e);
          s.savingConfig = false;
        });
      }
    },

    fetchDailyPlan: async () => {
      set((s) => {
        s.loadingPlan = true;
      });
      try {
        const res = await invoke<{ plan: DailyPlan }>('study_get_daily_plan');
        set((s) => {
          s.dailyPlan = res.plan;
          s.loadingPlan = false;
        });
      } catch (e) {
        set((s) => {
          s.error = errMsg(e);
          s.loadingPlan = false;
        });
      }
    },

    regeneratePlan: async () => {
      set((s) => {
        s.loadingPlan = true;
        s.error = null;
      });
      try {
        const res = await invoke<{ plan: DailyPlan }>('study_regenerate_plan');
        set((s) => {
          s.dailyPlan = res.plan;
          s.loadingPlan = false;
        });
      } catch (e) {
        set((s) => {
          s.error = errMsg(e);
          s.loadingPlan = false;
        });
      }
    },

    fetchDeckStatus: async () => {
      set((s) => {
        s.loadingDecks = true;
      });
      try {
        const res = await invoke<{ decks: DeckStatus[] }>('study_deck_status');
        set((s) => {
          s.deckStatus = res.decks;
          s.loadingDecks = false;
        });
      } catch (e) {
        set((s) => {
          s.error = errMsg(e);
          s.loadingDecks = false;
        });
      }
    },

    startSession: async (args) => {
      set((s) => {
        s.starting = true;
        s.error = null;
      });
      try {
        const res = await invoke<{ session: PracticeSession; plan: DailyPlan }>('study_start', {
          body: args ?? {},
        });
        if ((res.plan?.total_cards ?? 0) === 0) {
          set((s) => {
            s.error = 'NO_CARDS_FOR_SELECTION';
            s.starting = false;
          });
          return null;
        }
        set((s) => {
          s.session = res.session;
          s.current = null;
          s.starting = false;
        });
        return res.session.id;
      } catch (e) {
        set((s) => {
          s.error = errMsg(e);
          s.starting = false;
        });
        return null;
      }
    },

    nextActivity: async (sessionId) => {
      set((s) => {
        s.advancing = true;
        s.error = null;
      });
      try {
        const res = await invoke<NextActivityResponse>('study_next_activity', {
          sessionId,
        });
        set((s) => {
          s.current = res;
          s.advancing = false;
        });
        return res;
      } catch (e) {
        set((s) => {
          s.error = errMsg(e);
          s.advancing = false;
        });
        return null;
      }
    },

    submitActivity: async (body) => {
      set((s) => {
        s.submitting = true;
      });
      try {
        const res = await invoke<SubmitResponse>('study_submit_activity', { body });
        set((s) => {
          s.submitting = false;
        });
        return res;
      } catch (e) {
        set((s) => {
          s.error = errMsg(e);
          s.submitting = false;
        });
        return null;
      }
    },

    endSession: async (sessionId, abandoned = false) => {
      try {
        const res = await invoke<SessionSummaryResponse>('study_end', {
          body: { session_id: sessionId, abandoned },
        });
        return res;
      } catch (e) {
        set((s) => {
          s.error = errMsg(e);
        });
        return null;
      }
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),

    resetRunner: () =>
      set((s) => {
        s.session = null;
        s.current = null;
      }),
  })),
);

// ── Shadowing's two calls (no store state: a run owns its own cards) ────────

/** Every card of a session, each word once, in plan order; `full` widens the run to the session's decks. */
export async function fetchSessionCards(sessionId: string, full: boolean): Promise<SessionCard[]> {
  const res = await invoke<{ cards: SessionCard[]; total: number }>('study_session_cards', {
    sessionId,
    full,
  });
  return res.cards;
}

export interface ShadowProgressResult {
  cards_viewed: number;
  seconds_reported: number;
  seconds_credited: number;
  seconds_used_today: number;
  daily_cap_seconds: number;
  xp_earned: number;
}

/** Tells the engine which cards were heard and how many seconds actually played. */
export function reportShadowProgress(body: {
  session_id: string;
  card_ids: string[];
  played_seconds: number;
}): Promise<ShadowProgressResult> {
  return invoke<ShadowProgressResult>('study_report_shadow_progress', { body });
}
