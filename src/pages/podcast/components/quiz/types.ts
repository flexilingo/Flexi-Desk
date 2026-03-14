export type LearningModeType = 'general' | 'ielts' | 'celpip';
export type ContentType = 'video' | 'podcast' | 'text';
export type SessionStatus = 'active' | 'completed' | 'abandoned';
export type QuestionType =
  | 'fill_blank'
  | 'mcq_meaning'
  | 'mcq_grammar'
  | 'mcq_synonym'
  | 'word_order'
  | 'matching'
  | 'reading_comprehension'
  | 'sentence_completion';

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question?: string;
  sentence?: string;
  answer: string;
  options?: string[];
  hint?: string;
  difficulty: string;
  source_index?: number;
  lemma?: string;
  pos?: string;
  grammar_point?: string;
  passage?: string;
  passage_indices?: number[];
  comprehension_skill?: string;
  partial_sentence?: string;
  full_sentence?: string;
  pairs?: Array<{ left: string; right: string }>;
  pair_count?: number;
  jumbled?: string[];
  original?: string;
  word_count?: number;
  context_sentence?: string;
}

export interface SessionProgress {
  vocabulary_reviewed: number;
  vocabulary_total: number;
  questions_answered: number;
  questions_total: number;
  questions_correct: number;
  current_score_percent: number;
}

export interface CEFRPerformance {
  [level: string]: {
    answered: number;
    correct: number;
  };
}

export interface SessionSummary {
  total_time_seconds: number;
  vocabulary_learned: number;
  questions_answered: number;
  questions_correct: number;
  score_percent: number;
  cefr_performance: CEFRPerformance;
  weak_areas: string[];
  strong_areas: string[];
}

export interface MilestoneProgress {
  milestone_id: string;
  sessions: number;
  accuracy: number;
  vocabulary: number;
  ready_for_test: boolean;
}

export interface CreateSessionResponse {
  session_id: string;
  status: 'created';
  quiz_questions: QuizQuestion[];
  estimated_time_minutes: number;
}

export interface SubmitAnswerResponse {
  is_correct: boolean;
  correct_answer: string;
  explanation?: string;
  session_progress: {
    questions_answered: number;
    questions_total: number;
    questions_correct: number;
  };
}

export interface CompleteSessionResponse {
  session_summary: SessionSummary;
  vocabulary_to_review: string[];
  milestone_progress?: MilestoneProgress | null;
  xp?: { earned: number; total: number; level: number };
  streak?: { currentStreak: number; longestStreak: number; lastActiveDate: string };
}

export interface ActiveSessionResponse {
  has_active: boolean;
  session: {
    id: string;
    quiz_questions: QuizQuestion[];
    questions_answered: number;
    questions_correct: number;
    total_questions: number;
    answers?: Array<{ question_id: string; is_correct: boolean }>;
  } | null;
  resume_at_question_index?: number;
  answered_question_ids?: string[];
}
