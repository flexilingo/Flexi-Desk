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
  status: 'pending' | 'scoring' | 'scored' | 'failed';
  /** Only on get_results: queued / being analysed / done within the 'scoring' status. */
  scoring_state?: 'queued' | 'analyzing' | 'done' | 'failed';
  clb_score: number | null;
  raw_score: number | null;
  max_raw_score: number | null;
  time_spent_sec: number;
  answers: Record<string, unknown> | null;
  transcripts: Record<string, string> | null;
  ai_feedback: AiFeedback | null;
  /** Speaking, get_results only: task key -> storage object PATH of the learner's own recording. */
  recording_paths?: Record<string, string> | null;
}

export interface AiFeedback {
  tasks?: AiTaskFeedback[];
  overall_comment?: string;
}

export interface AiTaskFeedback {
  task_index?: number;
  /** TCF Canada stores a band per task; Québec / IRN store none (see `score`). */
  clb_score: number;
  /** TCF: the examiner's score out of 20. */
  score?: number;
  criteria: Record<string, { score: number; comment: string }>;
  overall_comment?: string;
  comment?: string;
  model_answer?: string;
  transcript?: string;
  /** Speaking: nothing was heard on the recording (core no-speech) - not a judged answer. */
  no_speech?: boolean;
  /** Writing: nothing was written for this task - the minimum, not judged. */
  no_answer?: boolean;
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
  /** TCF: the task instruction (replaces `prompt`). */
  consigne?: string;
  /** TCF EO task 1: the examiner's guiding questions. */
  guiding_questions?: string[];
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
  /** The prompt and picture each speaking task was answered against (full result only). */
  speaking_tasks?: SpeakingTaskContent[];
  /** Not read in full (not Pro, not one of a free account's 2 full results a month): no pictures, no recording paths. */
  speaking_media_locked?: boolean;
  /** Speaking task position ("0".."7") -> pre-authored model answers, highest band first. */
  speaking_model_answers?: Record<string, BandModelAnswer[]>;
  /** Full result only (both exams): listening part / item position -> its recording. */
  listening_audio?: Record<string, string>;
  /** CELPIP only: Writing at CLB 5/7/9 and the steps between bands, by task position. */
  celpip_model_answers?: CelpipModelAnswers;
  /** CELPIP: who reads this result in full. */
  celpip_access?: Pick<TcfAccess, 'full' | 'via' | 'can_translate' | 'free_remaining'>;
  /** CELPIP only: each Listening/Reading question's explanation, keyed part_<p>_q_<q>. */
  celpip_explanations?: TcfExplanations;
  /** TCF only (absent for CELPIP): pre-authored CO/CE explanations; `{locked}` entries for a free account. */
  tcf_explanations?: TcfExplanations;
  /** TCF only: EE/EO model answers at NCLC 5 and 7 (7 locked for a free account). */
  tcf_model_answers?: TcfModelAnswers;
  /** TCF: who reads this result in full (Pro, or a free account's free monthly result). */
  tcf_access?: TcfAccess;
  /** Locked results only: the section whose transcript / text / audio the server withheld. */
  review_locked?: { listening: boolean; reading: boolean };
}

/** The prompt and picture a speaking task was answered against. */
export interface SpeakingTaskContent {
  task_index: number;
  type?: string;
  title?: string;
  prompt?: string;
  situation?: string;
  image_url?: string;
  option_a_image?: string;
  option_b_image?: string;
}

/** get_results tcf_access — Pro, or one of a free account's 2 full results a month. */
export interface TcfAccess {
  full: boolean;
  via: 'pro' | 'free_monthly' | null;
  can_translate: boolean;
  free_remaining: number | null;
  listening_audio_locked?: boolean;
  recordings_locked?: boolean;
}

/** One CO/CE item's pre-authored explanation (English, except the verbatim French quote and term). */
export interface TcfMcqExplanation {
  /** false on a free account's free full result: translation stays Pro. */
  can_translate?: boolean;
  part_id: string;
  evidence_quote: string | null;
  why_correct: string | null;
  how_to_spot_next_time: string | null;
  skill_tested: string | null;
  technique: { name: string; how_to_apply: string | null } | null;
  vocabulary_note: { term: string; gloss: string; why_it_matters: string | null } | null;
  question_index?: number;
  /** One entry per WRONG option. */
  distractors: Array<{ option_index: number; trap_type: string; why_it_fails: string }>;
}

/** A free account: the explanation exists, its text was not sent. */
export interface TcfLockedExplanation {
  locked: true;
}

export type TcfExplanationEntry = TcfMcqExplanation | TcfLockedExplanation;

export interface TcfExplanations {
  /** True for free accounts. */
  locked: boolean;
  /** Key = the item's POSITION in the session ("0", "1", …). */
  listening: Record<string, TcfExplanationEntry>;
  reading: Record<string, TcfExplanationEntry>;
}

/** One band of a TCF model answer; a locked band carries no text. */
export interface TcfModelBand {
  nclc: number;
  locked?: true;
  answer?: string;
  what_sets_this_band?: string;
}

export interface TcfStepUp {
  rule: string;
  from_5: string;
  in_7: string;
}

export interface TcfStepUp9 {
  rule: string;
  from_7: string;
  in_9: string;
}

export interface TcfServedTask {
  can_translate?: boolean;
  part_id: string;
  title?: string;
  /** NCLC 5, 7 and — once authored — 9, lowest first. 7 and 9 locked for free. */
  bands: TcfModelBand[];
  /** 5 → 7. null for free accounts. */
  steps_up: TcfStepUp[] | null;
  steps_up_9?: TcfStepUp9[] | null;
}

/** One CLB band of a CELPIP model answer; a locked band carries no text. */
export interface CelpipModelBand {
  clb: number;
  locked?: true;
  answer?: string;
  what_sets_this_band?: string;
  words?: number;
}

/** TcfServedTask with CLB bands: same steps, same lock rule, same translation keys. */
export interface CelpipServedTask {
  can_translate?: boolean;
  part_id: string;
  title?: string;
  /** CLB 5, 7 and 9, lowest first. 7 and 9 locked unless the result is read in full. */
  bands: CelpipModelBand[];
  steps_up: TcfStepUp[] | null;
  steps_up_9?: TcfStepUp9[] | null;
}

export interface CelpipModelAnswers {
  /** Key = the task's POSITION within the section ("0", "1", ...). */
  writing: Record<string, CelpipServedTask>;
  speaking: Record<string, CelpipServedTask>;
}

/** Either exam's served task - what the shared model-answer block renders. */
export type ServedModelTask = TcfServedTask | CelpipServedTask;

/** One CLB band of a pre-authored speaking model answer (a locked band has no text). */
export interface BandModelAnswer {
  clb: number;
  locked?: boolean;
  answer?: string;
  what_sets_this_band?: string;
  words?: number;
}

export interface TcfModelAnswers {
  /** Key = the task's POSITION within the section ("0", "1", "2"). */
  writing: Record<string, TcfServedTask>;
  speaking: Record<string, TcfServedTask>;
}

/** UI languages the explanations can be translated into (not English). */
export type ExplanationTranslationLocale = 'fa' | 'ar' | 'fr' | 'hi' | 'zh';

export interface TranslateExplanationPayload {
  kind: 'mcq' | 'model_answer';
  part_id: string;
  locale: ExplanationTranslationLocale;
  question_index?: number;
  session_id?: string;
}

export interface TranslateExplanationResponse {
  texts: Record<string, string>;
}

/** exam?action=get_scoring_info — the tables behind "how is this scored?". */
export interface ExamScoringTable {
  key: 'celpip_mcq' | 'tcf_nclc' | 'tcf_cefr';
  /** Column ids, in order — translated via exam.scoringInfo.columns.<id>. */
  columns: string[];
  /** Display strings, highest level first. */
  rows: string[][];
}

export interface ExamScoringInfo {
  exam_type: string;
  tables: ExamScoringTable[];
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
  // Only on analyses served from the pre-generated catalogue (core question-analysis).
  why_your_choice_failed?: string | null;
  trap_type?: string | null;
  evidence_quote?: string | null;
  skill_tested?: string | null;
  technique?: { name: string; how_to_apply: string | null } | null;
  vocabulary_note?: { term: string; gloss: string; why_it_matters: string } | null;
  time_budget_seconds?: number | null;
  _source?: 'pregenerated';
}

/** Section-level counts over the analyses above (core summarizePatterns). */
export interface InsightMcqPatterns {
  top_traps: { trap_type: string; count: number }[];
  weakest_skills: { skill_tested: string; count: number }[];
  techniques_to_drill: { technique: string; count: number; how_to_apply: string }[];
  vocabulary_to_study: { term: string; gloss: string; why_it_matters: string }[];
}

export interface InsightMcqSection {
  wrong_count: number;
  total_count: number;
  question_analyses: InsightMcqQuestionAnalysis[];
  section_strategy: string;
  analyzed_count?: number;
  patterns?: InsightMcqPatterns;
  /** Every analysis came from the catalogue; section_strategy is then derived from patterns. */
  _fully_pregenerated?: boolean;
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
  /** "Take again": re-sit exactly the parts of this earlier practice session. */
  retake_session_id?: string;
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
/** Where an insight was generated: this device's model, the user's own key, or FlexiLingo's cloud (opt-in). */
export type InsightOrigin = 'device' | 'own_key' | 'cloud';

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
  audioAnswers?: Record<string, { audio_url: string; duration_sec: number }>;
  /** Seconds the section clock has run (practice: only this time counts on return). */
  activeSec?: number;
  /** TCF listening: seconds the clock stood still because a recording was due or playing. */
  pausedSec?: number;
  /** TCF listening: where the current item's recording stood, so a reload resumes it. */
  audio?: { partIndex: number; pos: number; done: boolean };
}

export type SectionType = 'listening' | 'reading' | 'writing' | 'speaking';

/** Canonical order. The backend indexes `current_section` against this. */
export const SECTION_TYPES: SectionType[] = ['listening', 'reading', 'writing', 'speaking'];

/** Mirrors the backend's `session-expiry.ts`: a session older than this can't resume. */
export const EXAM_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
