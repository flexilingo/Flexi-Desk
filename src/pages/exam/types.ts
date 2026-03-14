// ── Mapped types (camelCase) ────────────────────────────

export type ExamType = 'ielts' | 'toefl' | 'delf' | 'goethe' | 'dele' | 'hsk' | 'jlpt' | 'custom';

export type ExamStatus = 'not_started' | 'in_progress' | 'paused' | 'completed' | 'abandoned';

export type QuestionType =
  | 'multiple_choice'
  | 'fill_blank'
  | 'true_false'
  | 'matching'
  | 'ordering'
  | 'short_answer'
  | 'essay'
  | 'speaking'
  | 'listening_mc'
  | 'reading_mc'
  | 'cloze';

export interface ExamSession {
  id: string;
  examType: ExamType;
  title: string;
  language: string;
  status: ExamStatus;
  totalSections: number;
  currentSection: number;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  overallScore?: number;
  bandScore?: string;
  timeLimitMin?: number;
  elapsedSeconds: number;
  sectionsJson: string;
  resultsJson: string;
  feedbackJson: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ExamQuestion {
  id: string;
  sessionId: string;
  sectionIndex: number;
  questionIndex: number;
  questionType: QuestionType;
  prompt: string;
  contextText?: string;
  audioUrl?: string;
  imageUrl?: string;
  optionsJson: string;
  correctAnswer?: string;
  userAnswer?: string;
  isCorrect?: boolean;
  score?: number;
  maxScore: number;
  feedback?: string;
  timeSpentSec: number;
  createdAt: string;
}

export interface ExamTemplate {
  id: string;
  examType: ExamType;
  title: string;
  description?: string;
  language: string;
  sectionsJson: string;
  timeLimitMin?: number;
  totalQuestions: number;
  cefrLevel?: string;
  isBuiltin: boolean;
  createdAt: string;
}

export interface ExamHistory {
  id: string;
  examType: ExamType;
  language: string;
  totalAttempts: number;
  bestScore: number;
  averageScore: number;
  bestBand?: string;
  lastAttemptAt?: string;
  updatedAt: string;
}

// ── Raw IPC types (snake_case) ──────────────────────────

export interface RawExamSession {
  id: string;
  exam_type: string;
  title: string;
  language: string;
  status: string;
  total_sections: number;
  current_section: number;
  total_questions: number;
  answered_count: number;
  correct_count: number;
  overall_score: number | null;
  band_score: string | null;
  time_limit_min: number | null;
  elapsed_seconds: number;
  sections_json: string;
  results_json: string;
  feedback_json: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface RawExamQuestion {
  id: string;
  session_id: string;
  section_index: number;
  question_index: number;
  question_type: string;
  prompt: string;
  context_text: string | null;
  audio_url: string | null;
  image_url: string | null;
  options_json: string;
  correct_answer: string | null;
  user_answer: string | null;
  is_correct: boolean | null;
  score: number | null;
  max_score: number;
  feedback: string | null;
  time_spent_sec: number;
  created_at: string;
}

export interface RawExamTemplate {
  id: string;
  exam_type: string;
  title: string;
  description: string | null;
  language: string;
  sections_json: string;
  time_limit_min: number | null;
  total_questions: number;
  cefr_level: string | null;
  is_builtin: boolean;
  created_at: string;
}

export interface RawExamHistory {
  id: string;
  exam_type: string;
  language: string;
  total_attempts: number;
  best_score: number;
  average_score: number;
  best_band: string | null;
  last_attempt_at: string | null;
  updated_at: string;
}

// ── Mappers ─────────────────────────────────────────────

export function mapSession(raw: RawExamSession): ExamSession {
  return {
    id: raw.id,
    examType: raw.exam_type as ExamType,
    title: raw.title,
    language: raw.language,
    status: raw.status as ExamStatus,
    totalSections: raw.total_sections,
    currentSection: raw.current_section,
    totalQuestions: raw.total_questions,
    answeredCount: raw.answered_count,
    correctCount: raw.correct_count,
    overallScore: raw.overall_score ?? undefined,
    bandScore: raw.band_score ?? undefined,
    timeLimitMin: raw.time_limit_min ?? undefined,
    elapsedSeconds: raw.elapsed_seconds,
    sectionsJson: raw.sections_json,
    resultsJson: raw.results_json,
    feedbackJson: raw.feedback_json,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    startedAt: raw.started_at ?? undefined,
    completedAt: raw.completed_at ?? undefined,
  };
}

export function mapQuestion(raw: RawExamQuestion): ExamQuestion {
  return {
    id: raw.id,
    sessionId: raw.session_id,
    sectionIndex: raw.section_index,
    questionIndex: raw.question_index,
    questionType: raw.question_type as QuestionType,
    prompt: raw.prompt,
    contextText: raw.context_text ?? undefined,
    audioUrl: raw.audio_url ?? undefined,
    imageUrl: raw.image_url ?? undefined,
    optionsJson: raw.options_json,
    correctAnswer: raw.correct_answer ?? undefined,
    userAnswer: raw.user_answer ?? undefined,
    isCorrect: raw.is_correct ?? undefined,
    score: raw.score ?? undefined,
    maxScore: raw.max_score,
    feedback: raw.feedback ?? undefined,
    timeSpentSec: raw.time_spent_sec,
    createdAt: raw.created_at,
  };
}

export function mapTemplate(raw: RawExamTemplate): ExamTemplate {
  return {
    id: raw.id,
    examType: raw.exam_type as ExamType,
    title: raw.title,
    description: raw.description ?? undefined,
    language: raw.language,
    sectionsJson: raw.sections_json,
    timeLimitMin: raw.time_limit_min ?? undefined,
    totalQuestions: raw.total_questions,
    cefrLevel: raw.cefr_level ?? undefined,
    isBuiltin: raw.is_builtin,
    createdAt: raw.created_at,
  };
}

export function mapHistory(raw: RawExamHistory): ExamHistory {
  return {
    id: raw.id,
    examType: raw.exam_type as ExamType,
    language: raw.language,
    totalAttempts: raw.total_attempts,
    bestScore: raw.best_score,
    averageScore: raw.average_score,
    bestBand: raw.best_band ?? undefined,
    lastAttemptAt: raw.last_attempt_at ?? undefined,
    updatedAt: raw.updated_at,
  };
}

// ── Utilities ───────────────────────────────────────────

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  ielts: 'IELTS',
  toefl: 'TOEFL',
  delf: 'DELF/DALF',
  goethe: 'Goethe',
  dele: 'DELE',
  hsk: 'HSK',
  jlpt: 'JLPT',
  custom: 'Custom',
};

export const EXAM_TYPE_DESCRIPTIONS: Record<ExamType, string> = {
  ielts: 'International English Language Testing System',
  toefl: 'Test of English as a Foreign Language',
  delf: "Diplome d'etudes en langue francaise",
  goethe: 'Goethe-Zertifikat (German)',
  dele: 'Diplomas de Espanol como Lengua Extranjera',
  hsk: 'Hanyu Shuiping Kaoshi (Chinese)',
  jlpt: 'Japanese Language Proficiency Test',
  custom: 'Create your own exam',
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  fill_blank: 'Fill in the Blank',
  true_false: 'True / False',
  matching: 'Matching',
  ordering: 'Ordering',
  short_answer: 'Short Answer',
  essay: 'Essay',
  speaking: 'Speaking',
  listening_mc: 'Listening',
  reading_mc: 'Reading',
  cloze: 'Cloze',
};

export function formatExamElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function examScoreColor(score: number): string {
  if (score >= 80) return 'text-[#8BB7A3]';
  if (score >= 60) return 'text-[#C58C6E]';
  return 'text-error';
}

export function examScoreBg(score: number): string {
  if (score >= 80) return 'bg-[#8BB7A3]/10';
  if (score >= 60) return 'bg-[#C58C6E]/10';
  return 'bg-error/10';
}
