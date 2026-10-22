import { invoke } from '@tauri-apps/api/core';
import { generateInsightSkill, getInsightStatus } from '../services/celpipCloud';
import type {
  ExamInsight,
  ExamResults,
  InsightSkill,
  InsightSkillState,
  InsightOrigin,
  InsightStatus,
  McqItem,
  SectionResult,
  SectionType,
} from '../types';

/**
 * Two homes for CELPIP AI insight, one interface.
 *
 * The exam is always scored by FlexiLingo. Only the *insight* has an alternative:
 * by default it is written by the AI the user set up (their device or their own
 * key); FlexiLingo's cloud writes it only when the user switched that on. Both
 * providers speak `InsightStatus`, so `useStagedInsight` and every results
 * component are identical for both.
 */
export interface InsightProvider {
  readonly origin: InsightOrigin;
  fetchStatus(): Promise<InsightStatus>;
  /**
   * Generates one skill. Cloud may answer 202 with no `result` (work claimed,
   * running detached) — the caller then polls `fetchStatus`. Local always
   * resolves with a result or throws.
   */
  generate(skill: InsightSkill): Promise<{ skill: InsightSkill; result?: unknown }>;
}

/** Errors carry a backend-style code so the UI resolves one i18n message either way. */
export class InsightError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'InsightError';
  }
}

const SKILL_ORDER: InsightSkill[] = ['listening', 'reading', 'writing', 'speaking'];

/** Which sections the user actually attempted — everything else is `not_taken`. */
export function takenSectionsOf(results: ExamResults): SectionType[] {
  return results.section_results
    .filter((r) => r.status === 'scored' || r.clb_score != null)
    .map((r) => r.section_type);
}

// ── Cloud ────────────────────────────────────────────────────────────────────

export function cloudInsightProvider(sessionId: string): InsightProvider {
  return {
    origin: 'cloud',
    fetchStatus: () => getInsightStatus(sessionId),
    async generate(skill) {
      try {
        return await generateInsightSkill(sessionId, skill);
      } catch (err) {
        throw new InsightError(extractCode(err));
      }
    },
  };
}

/** `supabaseCall` rejects with a JSON string carrying `{ code }`. */
function extractCode(err: unknown): string {
  const raw = String(err);
  try {
    const parsed = JSON.parse(raw.replace(/^Error:\s*/, '')) as { code?: string; error?: string };
    return parsed.code || parsed.error || 'UNKNOWN_ERROR';
  } catch {
    // Rust surfaces bare codes for its own failures.
    const bare = raw.match(/OLLAMA_NOT_RUNNING|OLLAMA_MODEL_MISSING|AI_KEY_MISSING/);
    if (bare) return bare[0];
    return /^[A-Z_]+$/.test(raw) ? raw : 'UNKNOWN_ERROR';
  }
}

// ── Local (on-device model) ──────────────────────────────────────────────────

interface LocalInsightRow {
  skill: string;
  status: string;
  result: string | null;
  error: string | null;
}

/**
 * Assembles what the model needs to analyse one skill.
 *
 * MCQ skills send only the questions the user got WRONG — sending the whole
 * paper wastes context and invites the model to invent errors. Productive skills
 * send the response plus the CLB the cloud already awarded, so the feedback
 * can't contradict the score.
 */
export function buildSkillContext(results: ExamResults, skill: InsightSkill): string {
  const result = results.section_results.find((r) => r.section_type === skill);

  if (skill === 'summary') {
    const { session } = results;
    return JSON.stringify({
      exam_type: session.exam_type,
      raw_scores: Object.fromEntries(
        results.section_results.map((r) => [r.section_type, r.raw_score]),
      ),
      overall_clb: session.m_score,
      section_scores: Object.fromEntries(
        results.section_results.map((r) => [r.section_type, r.clb_score]),
      ),
      sections_taken: takenSectionsOf(results),
    });
  }

  if (!result) return '{}';

  if (skill === 'listening' || skill === 'reading') {
    return JSON.stringify({
      wrong_answers: collectWrongAnswers(results, skill),
      raw_score: result.raw_score,
      max_raw_score: result.max_raw_score,
      clb_score: result.clb_score,
    });
  }

  // Writing / speaking: the user's own words plus the grader's per-task verdict.
  return JSON.stringify({
    clb_score: result.clb_score,
    tasks: (result.ai_feedback?.tasks ?? []).map((task, i) => ({
      task_index: task.task_index ?? i,
      task_clb: task.clb_score,
      ...(typeof task.score === 'number' ? { score_out_of_20: task.score } : {}),
      response:
        result.transcripts?.[`task_${task.task_index ?? i}`] ??
        task.transcript ??
        String(result.answers?.[`task_${task.task_index ?? i}`] ?? ''),
      criteria: task.criteria,
    })),
  });
}

/** Pairs each wrong MCQ answer with its question text and the correct option. */
function collectWrongAnswers(results: ExamResults, skill: 'listening' | 'reading') {
  const content =
    skill === 'listening' ? results.exam_set?.listening_content : results.exam_set?.reading_content;
  const answers = results.section_results.find((r) => r.section_type === skill)?.answers ?? {};
  const wrong: Record<string, unknown>[] = [];

  // Answers are keyed by POSITION in this session (core answer-keys), which is also
  // how the results screen matches an analysis back to its question.
  (content?.parts ?? []).forEach((part, pi) => {
    (part.questions as McqItem[]).forEach((q, qi) => {
      const key = `part_${pi}_q_${qi}`;
      const picked = answers[key];
      if (picked === undefined || picked === q.correct_index) return;
      wrong.push({
        part_index: pi,
        question_index: qi,
        question_text: q.question,
        user_choice: typeof picked === 'number' ? q.options[picked] : String(picked),
        correct_choice: q.options[q.correct_index],
      });
    });
  });
  return wrong;
}

/**
 * One sentence on the official result of a TCF section, so the feedback cannot
 * contradict it: an NCLC band for TCF Canada, the raw score for Quebec / IRN (whose
 * level is a CEFR letter derived on read, never stored).
 */
export function tcfLevelNote(results: ExamResults, skill: InsightSkill): string | null {
  const row = results.section_results.find((r) => r.section_type === skill);
  if (!row) return null;
  const parts: string[] = [];
  if (row.clb_score != null) parts.push(`NCLC ${row.clb_score}`);
  if (row.raw_score != null) {
    const max = skill === 'listening' || skill === 'reading' ? 699 : 20;
    parts.push(`raw score ${row.raw_score} out of ${max}`);
  }
  return parts.length ? parts.join(', ') : null;
}

function clbOf(results: ExamResults, skill: InsightSkill): number | undefined {
  const r: SectionResult | undefined = results.section_results.find(
    (x) => x.section_type === skill,
  );
  return r?.clb_score ?? undefined;
}

/**
 * Reads the locally-cached rows and presents them exactly like the cloud's
 * `?skill=status` response, including `not_taken` for skipped sections.
 */
export function localInsightProvider(
  sessionId: string,
  results: ExamResults,
  origin: Exclude<InsightOrigin, 'cloud'> = 'device',
): InsightProvider {
  const taken = takenSectionsOf(results);

  return {
    origin,

    async fetchStatus(): Promise<InsightStatus> {
      const rows = await invoke<LocalInsightRow[]>('celpip_local_insight_all', { sessionId });
      const bySkill = new Map(rows.map((r) => [r.skill, r]));

      const skills = {} as Record<InsightSkill, InsightSkillState>;
      const insight: Partial<ExamInsight> = {};

      for (const skill of SKILL_ORDER) {
        if (!taken.includes(skill as SectionType)) {
          skills[skill] = 'not_taken';
          continue;
        }
        skills[skill] = stateOf(bySkill.get(skill));
        hydrate(insight, skill, bySkill.get(skill));
      }

      skills.summary = taken.length === 0 ? 'not_taken' : stateOf(bySkill.get('summary'));
      hydrate(insight, 'summary', bySkill.get('summary'));

      return { skills, insight, taken_sections: taken };
    },

    async generate(skill) {
      // The local model has no server to claim the work, so a summary must not
      // start before every taken skill is done — same rule the cloud enforces.
      if (skill === 'summary') {
        const rows = await invoke<LocalInsightRow[]>('celpip_local_insight_all', { sessionId });
        const ready = new Set(rows.filter((r) => r.status === 'ready').map((r) => r.skill));
        const missing = taken.filter((s) => !ready.has(s));
        if (missing.length > 0) throw new InsightError('INSIGHT_SUMMARY_NOT_READY');
      }

      try {
        const json = await invoke<string>('celpip_generate_local_insight', {
          sessionId,
          skill,
          context: buildSkillContext(results, skill),
          clbScore: clbOf(results, skill) ?? null,
          examType: results.session.exam_type ?? null,
          levelNote: results.session.exam_type?.startsWith('tcf')
            ? tcfLevelNote(results, skill)
            : null,
        });
        return { skill, result: JSON.parse(json) };
      } catch (err) {
        throw new InsightError(extractCode(err));
      }
    },
  };
}

function stateOf(row: LocalInsightRow | undefined): InsightSkillState {
  if (!row) return 'pending';
  if (row.status === 'ready') return 'ready';
  if (row.status === 'error') return 'error';
  if (row.status === 'generating') return 'generating';
  return 'pending';
}

/** Folds a stored JSON fragment back into the shared `ExamInsight` shape. */
function hydrate(insight: Partial<ExamInsight>, skill: InsightSkill, row?: LocalInsightRow) {
  if (!row?.result || row.status !== 'ready') return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.result);
  } catch {
    return; // A corrupt row shows as "not generated", never as a crash.
  }

  if (skill === 'summary') {
    const s = parsed as Pick<ExamInsight, 'summary' | 'improvement_plan'>;
    insight.summary = s.summary;
    insight.improvement_plan = s.improvement_plan;
    return;
  }
  (insight as Record<string, unknown>)[skill] = parsed;
}
