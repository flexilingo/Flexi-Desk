/** The website's Writing practice shapes (flexi-lingo-front `store/writingPracticeApi.ts`). */

export type WritingExamType =
  | 'ielts_task1'
  | 'ielts_task2'
  | 'toefl_integrated'
  | 'toefl_independent'
  | 'celpip'
  | 'cambridge_fce'
  | 'cambridge_cae'
  | 'duolingo'
  | 'pte'
  | 'general_email'
  | 'general_essay'
  | 'general_letter'
  | 'general_report';

export interface WritingPrompt {
  id: string;
  exam_type: WritingExamType;
  topic: string;
  prompt_text: string;
  difficulty?: string;
  source: string;
  supplementary_data?: Record<string, unknown> | null;
  word_limit_min?: number;
  word_limit_max?: number;
  time_limit_seconds?: number;
  is_active: boolean;
  usage_count: number;
  created_at: string;
}

export interface ErrorHighlight {
  text: string;
  correction: string;
  type: 'grammar' | 'vocabulary' | 'spelling' | 'punctuation';
  explanation: string;
  source?: 'ai' | 'languagetool';
}

export interface VocabularyAnalysis {
  estimated_cefr: string;
  lexical_diversity: number;
  advanced_words: string[];
  suggested_upgrades: Array<{ original: string; upgrade: string }>;
}

export interface GradingMeta {
  model: string;
  quality: 'standard' | 'advanced';
  double_graded: boolean;
  score_variance?: number;
  /** Desk only: where a local grade was made. Absent on grades made by FlexiLingo's cloud. */
  origin?: 'device' | 'own_key';
}

export interface WritingFeedback {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  error_highlights: ErrorHighlight[];
  suggestions: string[];
  vocabulary_analysis?: VocabularyAnalysis;
  grading_meta?: GradingMeta;
}

export interface WritingSession {
  id: string;
  user_id: string;
  prompt_id?: string;
  exam_type: WritingExamType;
  status: 'active' | 'submitted' | 'graded' | 'cancelled';
  essay_text?: string | null;
  word_count: number;
  time_limit_seconds?: number | null;
  time_spent_seconds: number;
  timer_enabled: boolean;
  overall_score?: number | null;
  criteria_scores?: Record<string, number> | null;
  feedback?: WritingFeedback | null;
  ai_rewritten_version?: string | null;
  started_at: string;
  submitted_at?: string | null;
  graded_at?: string | null;
  created_at: string;
  prompt?: WritingPrompt;
}

export interface WritingStats {
  total_sessions: number;
  graded_sessions: number;
  best_criteria: string | null;
  weakest_criteria: string | null;
}

export interface UsageInfo {
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  isUnlimited: boolean;
  resetsAt?: string;
  limitType?: 'monthly' | 'daily';
}

export interface LimitInfo {
  limitType: 'daily' | 'monthly';
  resetsAt: string;
  monthlyLimit?: number | null;
  dailyLimit?: number | null;
}

/** Where a session lives: on this computer, or in the FlexiLingo cloud (cloud AI mode). */
export type SessionRoute = 'local' | 'cloud';

export const EXAM_CATEGORIES: { key: 'exams' | 'general'; types: WritingExamType[] }[] = [
  {
    key: 'exams',
    types: [
      'ielts_task1',
      'ielts_task2',
      'toefl_integrated',
      'toefl_independent',
      'celpip',
      'cambridge_fce',
      'cambridge_cae',
      'duolingo',
      'pte',
    ],
  },
  { key: 'general', types: ['general_email', 'general_essay', 'general_letter', 'general_report'] },
];
