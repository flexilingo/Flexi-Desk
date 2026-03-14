// ── Mapped types (camelCase) ────────────────────────────

export type WritingTaskType =
  | 'free'
  | 'essay'
  | 'email'
  | 'ielts_task1'
  | 'ielts_task2'
  | 'toefl_integrated'
  | 'toefl_independent'
  | 'delf'
  | 'goethe';

export type WritingStatus =
  | 'draft'
  | 'writing'
  | 'submitted'
  | 'correcting'
  | 'corrected'
  | 'scored';

export type CorrectionErrorType =
  | 'grammar'
  | 'spelling'
  | 'punctuation'
  | 'vocabulary'
  | 'style'
  | 'coherence'
  | 'register';

export type CorrectionSeverity = 'minor' | 'major' | 'critical';

export interface WritingSession {
  id: string;
  title: string;
  language: string;
  taskType: WritingTaskType;
  promptText?: string;
  originalText: string;
  correctedText?: string;
  wordCount: number;
  targetWords?: number;
  timeLimitMin?: number;
  elapsedSeconds: number;
  status: WritingStatus;
  overallScore?: number;
  grammarScore?: number;
  vocabularyScore?: number;
  coherenceScore?: number;
  taskScore?: number;
  bandScore?: string;
  feedbackJson: string;
  correctionsJson: string;
  grammarPatternsJson: string;
  cefrLevel?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  completedAt?: string;
}

export interface WritingCorrection {
  id: string;
  sessionId: string;
  originalSpan: string;
  correctedSpan: string;
  errorType: CorrectionErrorType;
  explanation?: string;
  startOffset: number;
  endOffset: number;
  severity: CorrectionSeverity;
  createdAt: string;
}

export interface WritingPrompt {
  id: string;
  taskType: WritingTaskType;
  language: string;
  title: string;
  description: string;
  targetWords?: number;
  timeLimitMin?: number;
  cefrLevel?: string;
  isBuiltin: boolean;
  createdAt: string;
}

export interface WritingStats {
  id: string;
  language: string;
  totalSessions: number;
  totalWordsWritten: number;
  averageScore: number;
  bestScore: number;
  totalCorrections: number;
  commonErrorsJson: string;
  updatedAt: string;
}

// ── Raw IPC types (snake_case) ──────────────────────────

export interface RawWritingSession {
  id: string;
  title: string;
  language: string;
  task_type: string;
  prompt_text: string | null;
  original_text: string;
  corrected_text: string | null;
  word_count: number;
  target_words: number | null;
  time_limit_min: number | null;
  elapsed_seconds: number;
  status: string;
  overall_score: number | null;
  grammar_score: number | null;
  vocabulary_score: number | null;
  coherence_score: number | null;
  task_score: number | null;
  band_score: string | null;
  feedback_json: string;
  corrections_json: string;
  grammar_patterns_json: string;
  cefr_level: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
}

export interface RawWritingCorrection {
  id: string;
  session_id: string;
  original_span: string;
  corrected_span: string;
  error_type: string;
  explanation: string | null;
  start_offset: number;
  end_offset: number;
  severity: string;
  created_at: string;
}

export interface RawWritingPrompt {
  id: string;
  task_type: string;
  language: string;
  title: string;
  description: string;
  target_words: number | null;
  time_limit_min: number | null;
  cefr_level: string | null;
  is_builtin: boolean;
  created_at: string;
}

export interface RawWritingStats {
  id: string;
  language: string;
  total_sessions: number;
  total_words_written: number;
  average_score: number;
  best_score: number;
  total_corrections: number;
  common_errors_json: string;
  updated_at: string;
}

// ── Mappers ─────────────────────────────────────────────

export function mapSession(raw: RawWritingSession): WritingSession {
  return {
    id: raw.id,
    title: raw.title,
    language: raw.language,
    taskType: raw.task_type as WritingTaskType,
    promptText: raw.prompt_text ?? undefined,
    originalText: raw.original_text,
    correctedText: raw.corrected_text ?? undefined,
    wordCount: raw.word_count,
    targetWords: raw.target_words ?? undefined,
    timeLimitMin: raw.time_limit_min ?? undefined,
    elapsedSeconds: raw.elapsed_seconds,
    status: raw.status as WritingStatus,
    overallScore: raw.overall_score ?? undefined,
    grammarScore: raw.grammar_score ?? undefined,
    vocabularyScore: raw.vocabulary_score ?? undefined,
    coherenceScore: raw.coherence_score ?? undefined,
    taskScore: raw.task_score ?? undefined,
    bandScore: raw.band_score ?? undefined,
    feedbackJson: raw.feedback_json,
    correctionsJson: raw.corrections_json,
    grammarPatternsJson: raw.grammar_patterns_json,
    cefrLevel: raw.cefr_level ?? undefined,
    errorMessage: raw.error_message ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    submittedAt: raw.submitted_at ?? undefined,
    completedAt: raw.completed_at ?? undefined,
  };
}

export function mapCorrection(raw: RawWritingCorrection): WritingCorrection {
  return {
    id: raw.id,
    sessionId: raw.session_id,
    originalSpan: raw.original_span,
    correctedSpan: raw.corrected_span,
    errorType: raw.error_type as CorrectionErrorType,
    explanation: raw.explanation ?? undefined,
    startOffset: raw.start_offset,
    endOffset: raw.end_offset,
    severity: raw.severity as CorrectionSeverity,
    createdAt: raw.created_at,
  };
}

export function mapPrompt(raw: RawWritingPrompt): WritingPrompt {
  return {
    id: raw.id,
    taskType: raw.task_type as WritingTaskType,
    language: raw.language,
    title: raw.title,
    description: raw.description,
    targetWords: raw.target_words ?? undefined,
    timeLimitMin: raw.time_limit_min ?? undefined,
    cefrLevel: raw.cefr_level ?? undefined,
    isBuiltin: raw.is_builtin,
    createdAt: raw.created_at,
  };
}

export function mapStats(raw: RawWritingStats): WritingStats {
  return {
    id: raw.id,
    language: raw.language,
    totalSessions: raw.total_sessions,
    totalWordsWritten: raw.total_words_written,
    averageScore: raw.average_score,
    bestScore: raw.best_score,
    totalCorrections: raw.total_corrections,
    commonErrorsJson: raw.common_errors_json,
    updatedAt: raw.updated_at,
  };
}

// ── Utilities ───────────────────────────────────────────

export const TASK_TYPE_LABELS: Record<WritingTaskType, string> = {
  free: 'Free Writing',
  essay: 'Essay',
  email: 'Email/Letter',
  ielts_task1: 'IELTS Task 1',
  ielts_task2: 'IELTS Task 2',
  toefl_integrated: 'TOEFL Integrated',
  toefl_independent: 'TOEFL Independent',
  delf: 'DELF',
  goethe: 'Goethe',
};

export const ERROR_TYPE_LABELS: Record<CorrectionErrorType, string> = {
  grammar: 'Grammar',
  spelling: 'Spelling',
  punctuation: 'Punctuation',
  vocabulary: 'Vocabulary',
  style: 'Style',
  coherence: 'Coherence',
  register: 'Register',
};

export const SEVERITY_COLORS: Record<CorrectionSeverity, { text: string; bg: string }> = {
  minor: { text: 'text-muted-foreground', bg: 'bg-muted' },
  major: { text: 'text-[#C58C6E]', bg: 'bg-[#C58C6E]/10' },
  critical: { text: 'text-error', bg: 'bg-error/10' },
};

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function scoreColor(score: number): string {
  if (score >= 80) return 'text-[#8BB7A3]';
  if (score >= 60) return 'text-[#C58C6E]';
  return 'text-error';
}

export function scoreBg(score: number): string {
  if (score >= 80) return 'bg-[#8BB7A3]/10';
  if (score >= 60) return 'bg-[#C58C6E]/10';
  return 'bg-error/10';
}
