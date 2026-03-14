import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type {
  WritingSession,
  WritingCorrection,
  WritingPrompt,
  WritingStats,
  WritingTaskType,
  RawWritingSession,
  RawWritingCorrection,
  RawWritingPrompt,
  RawWritingStats,
} from '../types';
import { mapSession, mapCorrection, mapPrompt, mapStats } from '../types';

export type WritingView = 'sessions' | 'editor' | 'results' | 'prompts';

interface WritingState {
  view: WritingView;

  // Sessions
  sessions: WritingSession[];
  activeSession: WritingSession | null;
  isLoadingSessions: boolean;
  isCreating: boolean;

  // Corrections
  corrections: WritingCorrection[];

  // Prompts
  prompts: WritingPrompt[];
  isLoadingPrompts: boolean;

  // Stats
  stats: WritingStats | null;

  // Editor
  editorText: string;
  isSaving: boolean;
  isSubmitting: boolean;

  // Error
  error: string | null;

  // Actions — Navigation
  setView: (view: WritingView) => void;
  goBack: () => void;

  // Actions — Sessions
  fetchSessions: (language?: string) => Promise<void>;
  createSession: (
    title: string,
    language: string,
    taskType: WritingTaskType,
    promptText?: string,
    targetWords?: number,
    timeLimitMin?: number,
  ) => Promise<void>;
  openSession: (session: WritingSession) => void;
  deleteSession: (id: string) => Promise<void>;

  // Actions — Editor
  setEditorText: (text: string) => void;
  saveText: () => Promise<void>;
  submitWriting: () => Promise<void>;
  updateElapsed: (seconds: number) => Promise<void>;

  // Actions — Corrections
  saveCorrections: (params: {
    correctedText: string;
    corrections: CorrectionInput[];
    overallScore?: number;
    grammarScore?: number;
    vocabularyScore?: number;
    coherenceScore?: number;
    taskScore?: number;
    bandScore?: string;
    feedbackJson?: string;
    grammarPatternsJson?: string;
    cefrLevel?: string;
  }) => Promise<void>;
  fetchCorrections: (sessionId: string) => Promise<void>;

  // Actions — Prompts
  fetchPrompts: (taskType?: string, language?: string) => Promise<void>;
  createPrompt: (params: {
    taskType: string;
    language: string;
    title: string;
    description: string;
    targetWords?: number;
    timeLimitMin?: number;
    cefrLevel?: string;
  }) => Promise<void>;
  deletePrompt: (id: string) => Promise<void>;
  startFromPrompt: (prompt: WritingPrompt) => Promise<void>;

  // Actions — Stats
  fetchStats: (language: string) => Promise<void>;

  clearError: () => void;
}

export interface CorrectionInput {
  original_span: string;
  corrected_span: string;
  error_type: string;
  explanation: string | null;
  start_offset: number;
  end_offset: number;
  severity: string;
}

export const useWritingStore = create<WritingState>()(
  immer((set, get) => ({
    view: 'sessions',
    sessions: [],
    activeSession: null,
    isLoadingSessions: false,
    isCreating: false,
    corrections: [],
    prompts: [],
    isLoadingPrompts: false,
    stats: null,
    editorText: '',
    isSaving: false,
    isSubmitting: false,
    error: null,

    // ── Navigation ──────────────────────────────────────

    setView: (view) =>
      set((s) => {
        s.view = view;
        s.error = null;
      }),

    goBack: () =>
      set((s) => {
        if (s.view === 'editor' || s.view === 'results') {
          s.view = 'sessions';
          s.activeSession = null;
          s.corrections = [];
          s.editorText = '';
        } else if (s.view === 'prompts') {
          s.view = 'sessions';
        }
        s.error = null;
      }),

    // ── Sessions ────────────────────────────────────────

    fetchSessions: async (language) => {
      set((s) => {
        s.isLoadingSessions = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawWritingSession[]>('writing_list_sessions', {
          language: language ?? null,
          status: null,
          limit: 50,
        });
        set((s) => {
          s.sessions = raw.map(mapSession);
          s.isLoadingSessions = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingSessions = false;
        });
      }
    },

    createSession: async (title, language, taskType, promptText, targetWords, timeLimitMin) => {
      set((s) => {
        s.isCreating = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawWritingSession>('writing_create_session', {
          title,
          language,
          taskType,
          promptText: promptText ?? null,
          targetWords: targetWords ?? null,
          timeLimitMin: timeLimitMin ?? null,
        });
        const session = mapSession(raw);
        set((s) => {
          s.sessions.unshift(session);
          s.activeSession = session;
          s.editorText = session.originalText;
          s.view = 'editor';
          s.isCreating = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isCreating = false;
        });
      }
    },

    openSession: (session) => {
      set((s) => {
        s.activeSession = session;
        s.editorText = session.originalText;
        s.corrections = [];
        s.error = null;
        s.view =
          session.status === 'scored' || session.status === 'corrected' ? 'results' : 'editor';
      });
      if (session.status === 'scored' || session.status === 'corrected') {
        get().fetchCorrections(session.id);
      }
    },

    deleteSession: async (id) => {
      try {
        await invoke('writing_delete_session', { id });
        set((s) => {
          s.sessions = s.sessions.filter((sess) => sess.id !== id);
          if (s.activeSession?.id === id) {
            s.activeSession = null;
            s.view = 'sessions';
          }
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    // ── Editor ──────────────────────────────────────────

    setEditorText: (text) =>
      set((s) => {
        s.editorText = text;
      }),

    saveText: async () => {
      const { activeSession, editorText } = get();
      if (!activeSession) return;

      set((s) => {
        s.isSaving = true;
      });
      try {
        const raw = await invoke<RawWritingSession>('writing_update_text', {
          id: activeSession.id,
          text: editorText,
        });
        const updated = mapSession(raw);
        set((s) => {
          s.activeSession = updated;
          s.isSaving = false;
          // Update in list
          const idx = s.sessions.findIndex((sess) => sess.id === updated.id);
          if (idx >= 0) s.sessions[idx] = updated;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isSaving = false;
        });
      }
    },

    submitWriting: async () => {
      const { activeSession, editorText } = get();
      if (!activeSession) return;

      set((s) => {
        s.isSubmitting = true;
        s.error = null;
      });
      try {
        // Save text first
        await invoke('writing_update_text', { id: activeSession.id, text: editorText });
        // Then submit
        const raw = await invoke<RawWritingSession>('writing_submit', { id: activeSession.id });
        const updated = mapSession(raw);
        set((s) => {
          s.activeSession = updated;
          s.isSubmitting = false;
          const idx = s.sessions.findIndex((sess) => sess.id === updated.id);
          if (idx >= 0) s.sessions[idx] = updated;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isSubmitting = false;
        });
      }
    },

    updateElapsed: async (seconds) => {
      const { activeSession } = get();
      if (!activeSession) return;
      try {
        await invoke('writing_update_elapsed', {
          id: activeSession.id,
          elapsedSeconds: seconds,
        });
        set((s) => {
          if (s.activeSession) s.activeSession.elapsedSeconds = seconds;
        });
      } catch {
        /* best-effort */
      }
    },

    // ── Corrections ─────────────────────────────────────

    saveCorrections: async (params) => {
      const { activeSession } = get();
      if (!activeSession) return;

      set((s) => {
        s.error = null;
      });
      try {
        const raw = await invoke<RawWritingSession>('writing_save_corrections', {
          id: activeSession.id,
          correctedText: params.correctedText,
          corrections: params.corrections,
          overallScore: params.overallScore ?? null,
          grammarScore: params.grammarScore ?? null,
          vocabularyScore: params.vocabularyScore ?? null,
          coherenceScore: params.coherenceScore ?? null,
          taskScore: params.taskScore ?? null,
          bandScore: params.bandScore ?? null,
          feedbackJson: params.feedbackJson ?? null,
          grammarPatternsJson: params.grammarPatternsJson ?? null,
          cefrLevel: params.cefrLevel ?? null,
        });
        const updated = mapSession(raw);
        set((s) => {
          s.activeSession = updated;
          s.view = 'results';
          const idx = s.sessions.findIndex((sess) => sess.id === updated.id);
          if (idx >= 0) s.sessions[idx] = updated;
        });
        get().fetchCorrections(activeSession.id);
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    fetchCorrections: async (sessionId) => {
      try {
        const raw = await invoke<RawWritingCorrection[]>('writing_get_corrections', { sessionId });
        set((s) => {
          s.corrections = raw.map(mapCorrection);
        });
      } catch {
        /* best-effort */
      }
    },

    // ── Prompts ─────────────────────────────────────────

    fetchPrompts: async (taskType, language) => {
      set((s) => {
        s.isLoadingPrompts = true;
      });
      try {
        const raw = await invoke<RawWritingPrompt[]>('writing_list_prompts', {
          taskType: taskType ?? null,
          language: language ?? null,
        });
        set((s) => {
          s.prompts = raw.map(mapPrompt);
          s.isLoadingPrompts = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingPrompts = false;
        });
      }
    },

    createPrompt: async (params) => {
      try {
        const raw = await invoke<RawWritingPrompt>('writing_create_prompt', params);
        set((s) => {
          s.prompts.unshift(mapPrompt(raw));
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    deletePrompt: async (id) => {
      try {
        await invoke('writing_delete_prompt', { id });
        set((s) => {
          s.prompts = s.prompts.filter((p) => p.id !== id);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    startFromPrompt: async (prompt) => {
      await get().createSession(
        prompt.title,
        prompt.language,
        prompt.taskType,
        prompt.description,
        prompt.targetWords,
        prompt.timeLimitMin,
      );
    },

    // ── Stats ───────────────────────────────────────────

    fetchStats: async (language) => {
      try {
        const raw = await invoke<RawWritingStats>('writing_get_stats', { language });
        set((s) => {
          s.stats = mapStats(raw);
        });
      } catch {
        /* best-effort */
      }
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),
  })),
);
