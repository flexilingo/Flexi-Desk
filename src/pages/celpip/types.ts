// Ported verbatim from flexi-lingo-front `src/features/exam/types.ts`.
//
// The CELPIP exam CONTENT and session lifecycle are owned by the FlexiLingo
// backend, so these shapes must not drift. Admin-only shapes (part bank, exam-set
// generation) are deliberately absent — a desktop client never calls those.

export interface ExamConfig {
  exam_type: string;
  title: string;
  description: string;
  total_duration_minutes: number;
  sections_count: number;
  is_active: boolean;
}

export interface ExamSet {
  id: string;
  exam_type: string;
  title: string;
  difficulty: string;
  is_active: boolean;
  audio_generated: boolean;
  created_at: string;
}

export interface PracticeConfig {
  sections_order?: number[]; // canonical indices of selected sections, e.g. [0, 3]
  listening?: number[];
  reading?: number[];
  writing?: number[];
  speaking?: number[];
  /** Untimed relaxed full exam with tap-to-translate; excluded from history */
  learning_mode?: boolean;
}

export interface SampleResponses {
  writing?: Record<number, { response: string }>;
  speaking?: Record<number, { response: string }>;
}

export interface ExamSession {
  id: string;
  user_id: string;
  exam_set_id?: string;
  exam_type: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'scoring';
  current_section: number;
  mode?: 'exam' | 'practice';
  practice_config?: PracticeConfig;
  listening_score: number | null;
  reading_score: number | null;
  writing_score: number | null;
  speaking_score: number | null;
  m_score: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  /** Present on `get_results`; the sum of section times is the fallback. */
  total_time_sec?: number;
}

export interface SectionResult {
  section_type: 'listening' | 'reading' | 'writing' | 'speaking';
  section_index: number;
  status: 'pending' | 'scoring' | 'scored';
  clb_score: number | null;
  raw_score: number | null;
  max_raw_score: number | null;
  time_spent_sec: number;
  answers: Record<string, unknown> | null;
  transcripts: Record<string, string> | null;
  ai_feedback: AiFeedback | null;
}

export interface AiFeedback {
  tasks?: AiTaskFeedback[];
  overall_comment?: string;
}

export interface AiTaskFeedback {
  task_index?: number;
  clb_score: number;
  criteria: Record<string, { score: number; comment: string }>;
  overall_comment?: string;
  comment?: string;
  model_answer?: string;
  transcript?: string;
}

export interface ExamSetContent {
  id: string;
  title: string;
  listening_content: ListeningContent;
  reading_content: ReadingContent;
  writing_prompts: WritingPrompts;
  speaking_prompts: SpeakingPrompts;
  audio_urls: Record<string, string> | null;
}

export interface ListeningPart {
  part_index: number;
  title: string;
  audio_url?: string;
  script?: string;
  questions: McqItem[];
}

export interface ListeningContent {
  parts: ListeningPart[];
}

export interface ReadingMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface ReadingPassageSource {
  source: string;
  text: string;
}

export interface ReadingPart {
  part_index: number;
  type: 'correspondence' | 'diagram' | 'information' | 'multiple_sources' | 'viewpoints';
  title: string;
  passage?: string;
  passages?: ReadingPassageSource[];
  message_1?: ReadingMessage;
  message_2?: ReadingMessage;
  sources?: { label: string; text: string }[];
  questions: McqItem[];
}

export interface ReadingContent {
  parts: ReadingPart[];
}

export interface McqItem {
  question_index: number;
  question: string;
  options: string[];
  correct_index: number;
}

export interface WritingTask {
  task_index: number;
  title: string;
  prompt?: string;
  scenario?: string;
  recipient?: string;
  relationship?: string;
  bullet_points?: string[];
  time_limit_minutes: number;
  word_limit_min: number;
  word_limit_max: number;
}

export interface WritingPrompts {
  tasks: WritingTask[];
}

export interface SpeakingTaskOption {
  label: string;
  description: string;
  image_url?: string;
  image_description?: string;
}

export interface SpeakingTask {
  task_index: number;
  type: string;
  title: string;
  prompt: string;
  image_url?: string;
  image_description?: string;
  uses_task3_image?: boolean;
  situation?: string;
  topic?: string;
  recipient?: string;
  option_a?: SpeakingTaskOption;
  option_b?: SpeakingTaskOption;
  prep_seconds: number;
  speaking_seconds: number;
}

export interface SpeakingPrompts {
  tasks: SpeakingTask[];
}

export interface ExamSessionDetail {
  session: ExamSession;
  exam_set: ExamSetContent;
  section_results: SectionResult[];
}

export interface ExamResultsExamSet {
  listening_content: ListeningContent;
  reading_content: ReadingContent;
}

export interface ExamResults {
  session: ExamSession;
  section_results: SectionResult[];
  exam_set: ExamResultsExamSet | null;
}

export interface SubmitSectionPayload {
  session_id: string;
  section_type: string;
  answers: Record<string, unknown>;
  time_spent_sec: number;
  transcripts?: Record<string, string>;
}

// ── AI Insight Types ──────────────────────────────────────────────────────────

export interface InsightMcqQuestionAnalysis {
  part_index: number;
  question_index: number;
  question_text: string;
  user_choice: string;
  correct_choice: string;
  why_correct: string;
  strategy_tip: string;
}

export interface InsightMcqSection {
  wrong_count: number;
  total_count: number;
  question_analyses: InsightMcqQuestionAnalysis[];
  section_strategy: string;
}

export interface InsightSentenceCorrection {
  original: string;
  corrected: string;
  rule: string;
  explanation: string;
}

export interface InsightWritingTask {
  task_index: number;
  sentence_corrections: InsightSentenceCorrection[];
  vocabulary_suggestions: { word: string; better: string[] }[];
  structure_note: string;
}

export interface InsightSpeakingTask {
  task_index: number;
  sentence_corrections: InsightSentenceCorrection[];
  fluency_notes: string;
  vocabulary_improvements: { used: string; suggested: string[] }[];
}

export interface ExamInsight {
  generated_at: string;
  summary: {
    overall_assessment: string;
    strengths: string[];
    areas_to_improve: string[];
  };
  listening?: InsightMcqSection;
  reading?: InsightMcqSection;
  writing?: InsightWritingTask[];
  speaking?: InsightSpeakingTask[];
  improvement_plan: string[];
}

// ── Staged insight (per-skill generation) ────────────────────────────────────

export type InsightSkill = 'listening' | 'reading' | 'writing' | 'speaking' | 'summary';

/** Backend states plus the two client-only states (`error`, `limit_reached`). */
export type InsightSkillState =
  | 'ready'
  | 'generating'
  | 'pending'
  | 'not_taken'
  | 'unavailable'
  | 'error'
  | 'limit_reached';

export interface InsightStatus {
  skills: Record<InsightSkill, InsightSkillState>;
  insight: Partial<ExamInsight>;
  taken_sections: string[];
}

export interface AssembleExamPayload {
  exam_type: string;
  no_repeat?: boolean;
  difficulty?: string;
  learning_mode?: boolean;
}

export interface StartPracticePayload {
  exam_type: string;
  sections: Partial<Record<'listening' | 'reading' | 'writing' | 'speaking', number[]>>;
  /** Untimed relaxed session with tap-to-translate — excluded from history */
  learning_mode?: boolean;
}

// ── Part Vocabulary Types ────────────────────────────────────────────────────

export interface ExamVocabWord {
  word: string;
  definition: string;
  pos: string;
  cefr_level: string;
  example: string;
}

export interface ExamCollocation {
  collocation: string;
  definition: string;
  example: string;
  cefr_level: string;
}

export interface ExamIdiom {
  idiom: string;
  meaning: string;
  example: string;
}

export interface ExamGrammarNote {
  pattern: string;
  explanation: string;
  example: string;
}

export interface ExamPartVocab {
  part_id: string;
  section_type: string;
  part_index: number;
  vocabulary: ExamVocabWord[];
  collocations: ExamCollocation[];
  idioms: ExamIdiom[];
  grammar_notes: ExamGrammarNote[];
}

// ── Desk-only ────────────────────────────────────────────────────────────────

/** Where an AI analysis came from. Free users get the on-device model. */
export type InsightOrigin = 'cloud' | 'local';

/**
 * A section draft, persisted so a crash or quit mid-exam loses nothing.
 * Mirrors front's localStorage `exam_draft_{sessionId}_{section}` payload exactly.
 */
export interface ExamSectionDraft {
  partIndex: number;
  currentQuestion: number;
  answers: Record<string, unknown>;
  taskIndex?: number;
  /** Epoch ms — timers reconstruct remaining time from this on reload. */
  sectionStartedAt: number;
  taskStartedAt?: number;
  /** Speaking: the user fell back to typing because the mic failed. */
  typedMode?: boolean;
  audioAnswers?: Record<string, { audio_url: string; duration_sec: number }>;
}

export type SectionType = 'listening' | 'reading' | 'writing' | 'speaking';

/** Canonical order. The backend indexes `current_section` against this. */
export const SECTION_TYPES: SectionType[] = ['listening', 'reading', 'writing', 'speaking'];

/** Mirrors the backend's `session-expiry.ts`: a session older than this can't resume. */
export const EXAM_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
