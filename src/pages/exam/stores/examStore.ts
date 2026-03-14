import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type {
  ExamSession,
  ExamQuestion,
  ExamTemplate,
  ExamHistory,
  RawExamSession,
  RawExamQuestion,
  RawExamTemplate,
  RawExamHistory,
} from '../types';
import { mapSession, mapQuestion, mapTemplate, mapHistory } from '../types';

export type ExamView = 'picker' | 'sessions' | 'exam' | 'results';

interface ExamState {
  view: ExamView;

  // Sessions
  sessions: ExamSession[];
  activeSession: ExamSession | null;
  isLoadingSessions: boolean;
  isCreating: boolean;

  // Questions
  questions: ExamQuestion[];
  currentQuestionIndex: number;

  // Templates
  templates: ExamTemplate[];
  isLoadingTemplates: boolean;

  // History
  history: ExamHistory[];

  // Error
  error: string | null;

  // Actions — Navigation
  setView: (view: ExamView) => void;
  goBack: () => void;

  // Actions — Sessions
  fetchSessions: (examType?: string) => Promise<void>;
  createSession: (params: {
    examType: string;
    title: string;
    language: string;
    sectionsJson: string;
    totalSections: number;
    totalQuestions: number;
    timeLimitMin?: number;
  }) => Promise<void>;
  openSession: (session: ExamSession) => void;
  startExam: () => Promise<void>;
  pauseExam: (elapsed: number) => Promise<void>;
  completeExam: (params: {
    elapsed: number;
    overallScore?: number;
    bandScore?: string;
    resultsJson?: string;
    feedbackJson?: string;
  }) => Promise<void>;
  abandonExam: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  updateElapsed: (elapsed: number, section?: number) => Promise<void>;

  // Actions — Questions
  addQuestions: (questions: QuestionInput[]) => Promise<void>;
  fetchQuestions: (sectionIndex?: number) => Promise<void>;
  answerQuestion: (questionId: string, answer: string, timeSpent: number) => Promise<void>;
  scoreQuestion: (
    questionId: string,
    score: number,
    isCorrect: boolean,
    feedback?: string,
  ) => Promise<void>;
  setCurrentQuestion: (index: number) => void;

  // Actions — Templates
  fetchTemplates: (examType?: string, language?: string) => Promise<void>;
  createFromTemplate: (template: ExamTemplate) => Promise<void>;

  // Actions — History
  fetchHistory: (examType?: string) => Promise<void>;

  clearError: () => void;
}

export interface QuestionInput {
  section_index: number;
  question_index: number;
  question_type: string;
  prompt: string;
  context_text: string | null;
  audio_url: string | null;
  image_url: string | null;
  options: string[];
  correct_answer: string | null;
  max_score: number | null;
}

export const useExamStore = create<ExamState>()(
  immer((set, get) => ({
    view: 'picker',
    sessions: [],
    activeSession: null,
    isLoadingSessions: false,
    isCreating: false,
    questions: [],
    currentQuestionIndex: 0,
    templates: [],
    isLoadingTemplates: false,
    history: [],
    error: null,

    // ── Navigation ──────────────────────────────────────

    setView: (view) =>
      set((s) => {
        s.view = view;
        s.error = null;
      }),

    goBack: () =>
      set((s) => {
        if (s.view === 'exam' || s.view === 'results') {
          s.view = 'sessions';
          s.activeSession = null;
          s.questions = [];
          s.currentQuestionIndex = 0;
        } else if (s.view === 'sessions') {
          s.view = 'picker';
        }
        s.error = null;
      }),

    // ── Sessions ────────────────────────────────────────

    fetchSessions: async (examType) => {
      set((s) => {
        s.isLoadingSessions = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawExamSession[]>('exam_list_sessions', {
          examType: examType ?? null,
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

    createSession: async (params) => {
      set((s) => {
        s.isCreating = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawExamSession>('exam_create_session', params);
        const session = mapSession(raw);
        set((s) => {
          s.sessions.unshift(session);
          s.activeSession = session;
          s.view = 'exam';
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
        s.questions = [];
        s.currentQuestionIndex = 0;
        s.error = null;
        s.view = session.status === 'completed' ? 'results' : 'exam';
      });
      get().fetchQuestions();
    },

    startExam: async () => {
      const { activeSession } = get();
      if (!activeSession) return;
      try {
        const raw = await invoke<RawExamSession>('exam_start_session', { id: activeSession.id });
        set((s) => {
          s.activeSession = mapSession(raw);
          const idx = s.sessions.findIndex((sess) => sess.id === raw.id);
          if (idx >= 0) s.sessions[idx] = mapSession(raw);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    pauseExam: async (elapsed) => {
      const { activeSession } = get();
      if (!activeSession) return;
      try {
        const raw = await invoke<RawExamSession>('exam_pause_session', {
          id: activeSession.id,
          elapsedSeconds: elapsed,
        });
        set((s) => {
          s.activeSession = mapSession(raw);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    completeExam: async (params) => {
      const { activeSession } = get();
      if (!activeSession) return;
      try {
        const raw = await invoke<RawExamSession>('exam_complete_session', {
          id: activeSession.id,
          elapsedSeconds: params.elapsed,
          overallScore: params.overallScore ?? null,
          bandScore: params.bandScore ?? null,
          resultsJson: params.resultsJson ?? null,
          feedbackJson: params.feedbackJson ?? null,
        });
        const updated = mapSession(raw);
        set((s) => {
          s.activeSession = updated;
          s.view = 'results';
          const idx = s.sessions.findIndex((sess) => sess.id === updated.id);
          if (idx >= 0) s.sessions[idx] = updated;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    abandonExam: async () => {
      const { activeSession } = get();
      if (!activeSession) return;
      try {
        await invoke('exam_abandon_session', { id: activeSession.id });
        set((s) => {
          if (s.activeSession) s.activeSession.status = 'abandoned';
          s.view = 'sessions';
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    deleteSession: async (id) => {
      try {
        await invoke('exam_delete_session', { id });
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

    updateElapsed: async (elapsed, section) => {
      const { activeSession } = get();
      if (!activeSession) return;
      try {
        await invoke('exam_update_elapsed', {
          id: activeSession.id,
          elapsedSeconds: elapsed,
          currentSection: section ?? null,
        });
        set((s) => {
          if (s.activeSession) {
            s.activeSession.elapsedSeconds = elapsed;
            if (section != null) s.activeSession.currentSection = section;
          }
        });
      } catch {
        /* best-effort */
      }
    },

    // ── Questions ───────────────────────────────────────

    addQuestions: async (questions) => {
      const { activeSession } = get();
      if (!activeSession) return;
      try {
        const raw = await invoke<RawExamQuestion[]>('exam_add_questions', {
          sessionId: activeSession.id,
          questions,
        });
        set((s) => {
          s.questions = raw.map(mapQuestion);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    fetchQuestions: async (sectionIndex) => {
      const { activeSession } = get();
      if (!activeSession) return;
      try {
        const raw = await invoke<RawExamQuestion[]>('exam_get_questions', {
          sessionId: activeSession.id,
          sectionIndex: sectionIndex ?? null,
        });
        set((s) => {
          s.questions = raw.map(mapQuestion);
        });
      } catch {
        /* best-effort */
      }
    },

    answerQuestion: async (questionId, answer, timeSpent) => {
      try {
        const raw = await invoke<RawExamQuestion>('exam_answer_question', {
          questionId,
          userAnswer: answer,
          timeSpentSec: timeSpent,
        });
        const updated = mapQuestion(raw);
        set((s) => {
          const idx = s.questions.findIndex((q) => q.id === questionId);
          if (idx >= 0) s.questions[idx] = updated;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    scoreQuestion: async (questionId, score, isCorrect, feedback) => {
      try {
        const raw = await invoke<RawExamQuestion>('exam_score_question', {
          questionId,
          score,
          isCorrect,
          feedback: feedback ?? null,
        });
        const updated = mapQuestion(raw);
        set((s) => {
          const idx = s.questions.findIndex((q) => q.id === questionId);
          if (idx >= 0) s.questions[idx] = updated;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    setCurrentQuestion: (index) =>
      set((s) => {
        s.currentQuestionIndex = index;
      }),

    // ── Templates ───────────────────────────────────────

    fetchTemplates: async (examType, language) => {
      set((s) => {
        s.isLoadingTemplates = true;
      });
      try {
        const raw = await invoke<RawExamTemplate[]>('exam_list_templates', {
          examType: examType ?? null,
          language: language ?? null,
        });
        set((s) => {
          s.templates = raw.map(mapTemplate);
          s.isLoadingTemplates = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingTemplates = false;
        });
      }
    },

    createFromTemplate: async (template) => {
      const sections = JSON.parse(template.sectionsJson || '[]');
      await get().createSession({
        examType: template.examType,
        title: template.title,
        language: template.language,
        sectionsJson: template.sectionsJson,
        totalSections: sections.length,
        totalQuestions: template.totalQuestions,
        timeLimitMin: template.timeLimitMin,
      });
    },

    // ── History ─────────────────────────────────────────

    fetchHistory: async (examType) => {
      try {
        const raw = await invoke<RawExamHistory[]>('exam_get_history', {
          examType: examType ?? null,
        });
        set((s) => {
          s.history = raw.map(mapHistory);
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
