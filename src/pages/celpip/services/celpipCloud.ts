import { supabaseCall } from '@/lib/supabase';
import type { CoachReportListResponse, CoachReportResponse } from '../coach/coachTypes';
import type {
  AssembleExamPayload,
  ExamConfig,
  ExamScoringInfo,
  TranslateExplanationPayload,
  TranslateExplanationResponse,
  ExamPartVocab,
  ExamResults,
  ExamSession,
  ExamSessionDetail,
  InsightSkill,
  InsightStatus,
  SectionResult,
  StartPracticePayload,
  SubmitSectionPayload,
} from '../types';

/**
 * The CELPIP exam itself is a FlexiLingo service: the part bank, session
 * lifecycle, MCQ grading and writing/speaking scoring all live in the
 * `/exam` edge function. Desk never assembles or scores an exam locally.
 *
 * Only AI *insight* has a local alternative (see `useInsightRoute`), because
 * that is the one Pro-gated piece.
 *
 * NOTE ON GATING: the `/exam` function also exposes ~35 ADMIN actions
 * (`get_parts`, `create_part`, `generate_set`, `admin_*`, …). They require an
 * admin JWT and would 403. A desktop client must never call them, so they are
 * absent from this file by design.
 */

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  return sp.toString();
};

// ── Config ───────────────────────────────────────────────────────────────────

export const getExamConfigs = () =>
  supabaseCall<{ configs: ExamConfig[] }>('GET', '/exam?action=get_configs').then(
    (r) => r.configs ?? [],
  );

// ── Session lifecycle ────────────────────────────────────────────────────────

export interface AssembleExamResponse {
  session_id: string;
  exam_type: string;
  status: string;
  current_section: number;
  /** True when the backend handed back an existing unfinished session. */
  resumed?: boolean;
}

/** Full exam: the backend picks parts from the bank. */
export const assembleExam = (payload: AssembleExamPayload) =>
  supabaseCall<AssembleExamResponse>('POST', '/exam?action=assemble_exam', {
    ...payload,
  } as unknown as Record<string, unknown>);

/** Practice / partial exam: the user picked specific part indices per section. */
export const startPractice = (payload: StartPracticePayload) =>
  supabaseCall<{
    session_id: string;
    exam_type: string;
    mode: 'practice';
    sections_order: number[];
  }>('POST', '/exam?action=start_practice', { ...payload } as unknown as Record<string, unknown>);

export const getMySessions = (examType: string) =>
  supabaseCall<{ sessions: ExamSession[] }>(
    'GET',
    `/exam?${qs({ action: 'get_my_sessions', exam_type: examType })}`,
  ).then((r) => r.sessions ?? []);

export const getSession = (sessionId: string) =>
  supabaseCall<ExamSessionDetail>(
    'GET',
    `/exam?${qs({ action: 'get_session', session_id: sessionId })}`,
  );

export const submitSection = (payload: SubmitSectionPayload) =>
  supabaseCall<{ section_result: SectionResult; session: Partial<ExamSession> }>(
    'POST',
    '/exam?action=submit_section',
    { ...payload } as unknown as Record<string, unknown>,
  );

/** `force: true` ends the exam early, scoring only what was captured. */
export const completeExam = (sessionId: string, force?: boolean) =>
  supabaseCall<{ status: string; m_score?: number; message?: string }>(
    'POST',
    '/exam?action=complete_exam',
    { session_id: sessionId, ...(force ? { force: true } : {}) },
  );

export const getResults = (sessionId: string) =>
  supabaseCall<ExamResults>('GET', `/exam?${qs({ action: 'get_results', session_id: sessionId })}`);

// ── AI insight (Pro-gated on the cloud; desk falls back to the local model) ───

export const getInsightStatus = (sessionId: string) =>
  supabaseCall<InsightStatus>(
    'GET',
    `/exam?${qs({ action: 'get_insight', session_id: sessionId, skill: 'status' })}`,
  );

/**
 * Generates one skill's insight.
 *
 * Returns `{ skill, result }` when it's cached or ran inline. When the backend
 * claims the work and runs it detached it answers **202 `INSIGHT_GENERATING`**
 * with no `result` — the caller must then poll `getInsightStatus`.
 */
export const generateInsightSkill = (sessionId: string, skill: InsightSkill) =>
  supabaseCall<{ skill: InsightSkill; result?: unknown }>(
    'GET',
    `/exam?${qs({ action: 'get_insight', session_id: sessionId, skill })}`,
  );

// ── Vocabulary (free tier: unlimited) ────────────────────────────────────────

export const getPartVocab = (sessionId: string) =>
  supabaseCall<{ parts: ExamPartVocab[]; total_words: number; first_view?: boolean }>(
    'GET',
    `/exam?${qs({ action: 'get_part_vocab', session_id: sessionId })}`,
  );

// ── Scoring info + explanation translation (user-flow actions) ───────────────

/** The tables behind "how is this scored?" — static per exam, built by the backend from its scorers' constants. */
export const getScoringInfo = (examType: string) =>
  supabaseCall<ExamScoringInfo>(
    'GET',
    `/exam?${qs({ action: 'get_scoring_info', exam_type: examType })}`,
  );

/** Translate one TCF explanation card into the UI language (Pro; cached server-side). */
export const translateExplanation = (payload: TranslateExplanationPayload) =>
  supabaseCall<TranslateExplanationResponse>('POST', '/exam?action=translate_explanation', {
    ...payload,
  } as unknown as Record<string, unknown>);

/** The announcement slot to show a learner whose older results were scored the old way ({ slot: null } for everyone else). */
export const getScoringNotice = (examType: string) =>
  supabaseCall<{ slot: string | null }>(
    'GET',
    `/exam?${qs({ action: 'get_scoring_notice', exam_type: examType })}`,
  );

// ── Review transcripts (exam-review, the caller's own scored session) ────────

export interface ReviewTranscripts {
  parts: { position: number; script: unknown; evidence: string | null }[];
  /** A locked result: every part arrives with script and evidence null. */
  locked?: boolean;
}

/** Listening scripts for review, once Listening is scored (get_results strips them on purpose). */
export const getReviewTranscripts = (sessionId: string) =>
  supabaseCall<ReviewTranscripts>(
    'GET',
    `/exam-review?${qs({ action: 'transcripts', session_id: sessionId })}`,
  );

// ── Speaking: transcribe one answer while the learner records the next ───────

/** Fire-and-forget after each upload; a failure is harmless - scoring transcribes whatever was not settled. */
export const pretranscribeTask = (payload: {
  session_id: string;
  task_key: string;
  audio_url: string;
}) =>
  supabaseCall<{ accepted: boolean; reason?: string }>('POST', '/exam?action=pretranscribe_task', {
    ...payload,
  });

// ── Coach reports (written on the server every couple of days; desk only reads) ─

/** Omit reportId for the newest report. */
export const getCoachReport = (examType: string, reportId?: string) =>
  supabaseCall<CoachReportResponse>(
    'GET',
    `/exam?${qs({ action: 'get_coach_report', exam_type: examType, report_id: reportId })}`,
  );

export const listCoachReports = (examType: string) =>
  supabaseCall<CoachReportListResponse>(
    'GET',
    `/exam?${qs({ action: 'list_coach_reports', exam_type: examType })}`,
  );

export const markCoachReportRead = (reportId: string) =>
  supabaseCall<{ read_at: string | null; changed: boolean }>(
    'POST',
    '/exam?action=mark_coach_report_read',
    {
      report_id: reportId,
    },
  );
