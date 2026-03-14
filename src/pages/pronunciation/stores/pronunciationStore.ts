import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type {
  PracticeMode,
  PronunciationSession,
  PronunciationAttempt,
  PronunciationProgress,
  RawPronunciationSession,
  RawPronunciationAttempt,
  RawPronunciationProgress,
} from '../types';
import { mapSession, mapAttempt, mapProgress } from '../types';

export type PronunciationView = 'sessions' | 'practice' | 'results';

interface PronunciationState {
  // Navigation
  view: PronunciationView;

  // Sessions
  sessions: PronunciationSession[];
  isLoadingSessions: boolean;

  // Active practice
  activeSession: PronunciationSession | null;
  activeAttempt: PronunciationAttempt | null;
  attempts: PronunciationAttempt[];
  isRecording: boolean;
  isAnalyzing: boolean;

  // Progress
  progress: PronunciationProgress[];

  // Config
  practiceMode: PracticeMode;
  practiceLanguage: string;
  targetText: string;

  // Error
  error: string | null;

  // Actions
  setView: (view: PronunciationView) => void;
  goBack: () => void;
  setPracticeMode: (mode: PracticeMode) => void;
  setPracticeLanguage: (lang: string) => void;
  setTargetText: (text: string) => void;

  fetchSessions: () => Promise<void>;
  createSession: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  openSession: (session: PronunciationSession) => void;

  startRecording: (deviceId?: string) => Promise<void>;
  stopAndAnalyze: () => Promise<void>;

  fetchAttempts: (sessionId: string) => Promise<void>;
  fetchProgress: () => Promise<void>;

  clearError: () => void;
}

export const usePronunciationStore = create<PronunciationState>()(
  immer((set, get) => ({
    view: 'sessions',
    sessions: [],
    isLoadingSessions: false,
    activeSession: null,
    activeAttempt: null,
    attempts: [],
    isRecording: false,
    isAnalyzing: false,
    progress: [],
    practiceMode: 'word',
    practiceLanguage: 'en',
    targetText: '',
    error: null,

    setView: (view) =>
      set((s) => {
        s.view = view;
        s.error = null;
      }),
    goBack: () =>
      set((s) => {
        s.view = 'sessions';
        s.activeSession = null;
        s.activeAttempt = null;
        s.attempts = [];
        s.error = null;
      }),

    setPracticeMode: (mode) =>
      set((s) => {
        s.practiceMode = mode;
      }),
    setPracticeLanguage: (lang) =>
      set((s) => {
        s.practiceLanguage = lang;
      }),
    setTargetText: (text) =>
      set((s) => {
        s.targetText = text;
      }),

    fetchSessions: async () => {
      set((s) => {
        s.isLoadingSessions = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawPronunciationSession[]>('pronunciation_list_sessions', {
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

    createSession: async () => {
      const { practiceMode, practiceLanguage, targetText } = get();
      if (!targetText.trim()) {
        set((s) => {
          s.error = 'Enter text to practice';
        });
        return;
      }
      set((s) => {
        s.error = null;
      });
      try {
        const raw = await invoke<RawPronunciationSession>('pronunciation_create_session', {
          mode: practiceMode,
          language: practiceLanguage,
          targetText: targetText.trim(),
        });
        const session = mapSession(raw);
        set((s) => {
          s.activeSession = session;
          s.attempts = [];
          s.view = 'practice';
          s.sessions.unshift(session);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    deleteSession: async (id) => {
      try {
        await invoke('pronunciation_delete_session', { id });
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

    openSession: (session) => {
      set((s) => {
        s.activeSession = session;
        s.attempts = [];
        s.view = session.status === 'completed' ? 'results' : 'practice';
        s.error = null;
      });
      get().fetchAttempts(session.id);
    },

    startRecording: async (deviceId) => {
      const session = get().activeSession;
      if (!session) return;
      set((s) => {
        s.isRecording = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawPronunciationAttempt>('pronunciation_record_attempt', {
          sessionId: session.id,
          deviceId: deviceId ?? null,
        });
        set((s) => {
          s.activeAttempt = mapAttempt(raw);
        });
      } catch (err) {
        set((s) => {
          s.isRecording = false;
          s.error = String(err);
        });
      }
    },

    stopAndAnalyze: async () => {
      const { activeSession, activeAttempt } = get();
      if (!activeSession || !activeAttempt) return;
      set((s) => {
        s.isRecording = false;
        s.isAnalyzing = true;
      });
      try {
        const raw = await invoke<RawPronunciationAttempt>('pronunciation_stop_and_analyze', {
          sessionId: activeSession.id,
          attemptId: activeAttempt.id,
        });
        const attempt = mapAttempt(raw);
        set((s) => {
          s.activeAttempt = attempt;
          s.isAnalyzing = false;
          s.attempts.push(attempt);
          s.view = 'results';
        });
        // Refresh session to get updated scores
        try {
          const updatedRaw = await invoke<RawPronunciationSession>('pronunciation_get_session', {
            id: activeSession.id,
          });
          set((s) => {
            s.activeSession = mapSession(updatedRaw);
            const idx = s.sessions.findIndex((sess) => sess.id === activeSession.id);
            if (idx >= 0) s.sessions[idx] = mapSession(updatedRaw);
          });
        } catch {
          /* non-critical */
        }
      } catch (err) {
        set((s) => {
          s.isAnalyzing = false;
          s.error = String(err);
        });
      }
    },

    fetchAttempts: async (sessionId) => {
      try {
        const raw = await invoke<RawPronunciationAttempt[]>('pronunciation_get_attempts', {
          sessionId,
        });
        set((s) => {
          s.attempts = raw.map(mapAttempt);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    fetchProgress: async () => {
      try {
        const raw = await invoke<RawPronunciationProgress[]>('pronunciation_get_progress', {
          language: null,
        });
        set((s) => {
          s.progress = raw.map(mapProgress);
        });
      } catch {
        /* non-critical */
      }
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),
  })),
);
