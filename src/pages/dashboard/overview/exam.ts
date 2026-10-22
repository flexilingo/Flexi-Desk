/**
 * The exam half of the overview, as pure functions (port of the website's
 * `features/first-run/{examSkillStats,examIntent,ExamWeekPlan}` and the band
 * scales of `features/exam/examProfiles`).
 */

export type ExamKey = 'celpip' | 'tcf' | 'tcf_quebec';
export type Skill = 'listening' | 'reading' | 'writing' | 'speaking';
export const SKILLS: Skill[] = ['listening', 'reading', 'writing', 'speaking'];

export const WEEKLY_TARGET = 3;

/** Exams the desk can run itself. The others open on the website for now. */
export const DESK_EXAMS: ExamKey[] = ['celpip'];

export const isExamKey = (value: unknown): value is ExamKey =>
  value === 'celpip' || value === 'tcf' || value === 'tcf_quebec';

export const examName = (exam: ExamKey) =>
  exam === 'celpip' ? 'CELPIP' : exam === 'tcf_quebec' ? 'TCF Québec' : 'TCF Canada';

export const examFamily = (exam: ExamKey): 'celpip' | 'tcf' =>
  exam === 'celpip' ? 'celpip' : 'tcf';

/** One short practice per skill: one CELPIP part/task, or one TCF task / the easiest ten items. */
export const SHORT_PRACTICE: Record<'celpip' | 'tcf', Record<Skill, number[]>> = {
  celpip: { listening: [0], reading: [0], writing: [0], speaking: [0] },
  tcf: {
    listening: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    reading: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    writing: [1],
    speaking: [3],
  },
};

/** The first practice the goal panel starts (a short slice, scored at once). */
export const FIRST_PRACTICE: Record<ExamKey, Partial<Record<Skill, number[]>>> = {
  celpip: { reading: [0] },
  tcf: { listening: SHORT_PRACTICE.tcf.listening },
  tcf_quebec: { listening: SHORT_PRACTICE.tcf.listening },
};

// ── Band scales ─────────────────────────────────────────────────────────────

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export interface ExamProfile {
  /** Items in a whole listening/reading paper when sat item by item (TCF: 39); null = parts. */
  fullItems: Record<'listening' | 'reading', number | null>;
  band: {
    label: 'CLB' | 'NCLC' | 'CEFR';
    min: number;
    max: number;
    belowTable: number | null;
    kind: 'number' | 'level';
  };
}

const TCF_PROFILE: ExamProfile = {
  fullItems: { listening: 39, reading: 39 },
  band: { label: 'NCLC', min: 3, max: 10, belowTable: 3, kind: 'number' },
};

const PROFILES: Record<ExamKey, ExamProfile> = {
  celpip: {
    fullItems: { listening: null, reading: null },
    band: { label: 'CLB', min: 1, max: 12, belowTable: null, kind: 'number' },
  },
  tcf: TCF_PROFILE,
  tcf_quebec: {
    ...TCF_PROFILE,
    band: { label: 'CEFR', min: 0, max: CEFR_LEVELS.length - 1, belowTable: null, kind: 'level' },
  },
};

export const getExamProfile = (exam: ExamKey): ExamProfile => PROFILES[exam];

/** Band as shown: TCF's "below NCLC 4" is stored as 3 and shown "< 4"; a CEFR exam shows its letter. */
export function formatBand(profile: ExamProfile, value: number | null | undefined): string {
  if (value == null) return '–';
  if (profile.band.kind === 'level') return CEFR_LEVELS[value] ?? '–';
  const below = profile.band.belowTable;
  if (below != null && value <= below) return `< ${below + 1}`;
  return String(value);
}

// ── Which skill next ────────────────────────────────────────────────────────

export interface ExamSessionLike {
  id: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'scoring';
  exam_type: string;
  mode?: 'exam' | 'practice';
  practice_config?: Partial<Record<Skill, number[]>> | null;
  listening_score: number | null;
  reading_score: number | null;
  writing_score: number | null;
  speaking_score: number | null;
  created_at: string;
}

const SCORE_KEY = {
  listening: 'listening_score',
  reading: 'reading_score',
  writing: 'writing_score',
  speaking: 'speaking_score',
} as const;

function isShortItemPractice(session: ExamSessionLike, skill: Skill): boolean {
  if (session.mode !== 'practice') return false;
  if (skill !== 'listening' && skill !== 'reading') return false;
  const exam = isExamKey(session.exam_type) ? session.exam_type : 'celpip';
  const full = getExamProfile(exam).fullItems[skill];
  if (full == null) return false;
  const items = session.practice_config?.[skill];
  return Array.isArray(items) && items.length > 0 && items.length < full;
}

export interface SkillStat {
  skill: Skill;
  /** Practised in one of the last five completed sittings, short slices included. */
  tried: boolean;
  /** Mean stored score of those sittings, short slices left out; null = nothing comparable. */
  avg: number | null;
  /** Position of the newest sitting that practised it (0 = most recent); null = not tried. */
  lastAt: number | null;
}

/** Per skill, over the last five completed sittings (newest first). */
export function skillStats(sessions: ExamSessionLike[]): SkillStat[] {
  const recent = sessions.filter((s) => s.status === 'completed').slice(0, 5);
  return SKILLS.map((skill) => {
    let lastAt: number | null = null;
    const comparable: number[] = [];
    recent.forEach((s, i) => {
      const v = s[SCORE_KEY[skill]];
      if (typeof v !== 'number') return;
      if (lastAt === null) lastAt = i;
      if (!isShortItemPractice(s, skill)) comparable.push(v);
    });
    return {
      skill,
      tried: lastAt !== null,
      avg: comparable.length ? comparable.reduce((a, b) => a + b, 0) / comparable.length : null,
      lastAt,
    };
  });
}

/** Not tried yet first; otherwise the lowest comparable average; else the one practised least recently. */
export function nextSkill(sessions: ExamSessionLike[]): {
  skill: Skill;
  tried: boolean;
  avg: number | null;
} {
  const stats = skillStats(sessions);
  const untried = stats.find((s) => !s.tried);
  const pick =
    untried ??
    stats
      .filter((s) => s.avg != null)
      .reduce<SkillStat | null>(
        (low, s) => (low == null || (s.avg as number) < (low.avg as number) ? s : low),
        null,
      ) ??
    stats.reduce((old, s) => ((s.lastAt ?? 0) > (old.lastAt ?? 0) ? s : old));
  return { skill: pick.skill, tried: pick.tried, avg: pick.avg };
}

/** Monday 00:00 of the week `now` is in, as a timestamp. */
export function startOfWeek(now: Date): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const DAY_MS = 86_400_000;

export function daysUntil(
  examDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!examDate) return null;
  const target = new Date(`${examDate}T00:00:00`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - new Date(now.toDateString()).getTime()) / DAY_MS);
}

// ── Goal panel mode ─────────────────────────────────────────────────────────

export type ExamGoalPanelMode = 'full' | 'compact';

export const SNOOZE_MS = 7 * DAY_MS;

/**
 * Whether "which exam?" is asked as the main block, as a one-line row, or not at all.
 * The desk has no "first visit was about an exam" signal (that is the website's
 * analytics), so `cameForExam` is false here and the one-line row is the default.
 */
export function resolveExamGoalPanelMode(input: {
  examGoal: string | null | undefined;
  snoozedAt: number;
  now: number;
  nudgeDismissed: boolean;
  cameForExam?: boolean;
}): ExamGoalPanelMode | null {
  if (input.examGoal != null) return null;
  if (input.now - input.snoozedAt < SNOOZE_MS) return null;
  if (input.cameForExam) return 'full';
  return input.nudgeDismissed ? null : 'compact';
}

/** The official scale of each skill: CELPIP levels 1–12; TCF CO/CE 100–699, EE/EO 0–20. */
export function scoreRange(exam: string, skill: Skill): { min: number; max: number } {
  if (exam === 'celpip') return { min: 1, max: 12 };
  return skill === 'listening' || skill === 'reading'
    ? { min: 100, max: 699 }
    : { min: 0, max: 20 };
}

/** Whether the "how did it go?" panel is asking for the real score right now. */
export function examResultOpen(
  settings:
    | { exam_goal?: string | null; exam_date?: string | null; official_result?: unknown }
    | null
    | undefined,
  snoozedAt: number,
  now: Date = new Date(),
): boolean {
  if (!settings) return false;
  const { exam_goal: exam, exam_date: examDate } = settings;
  const today = now.toISOString().slice(0, 10);
  if (!exam || exam === 'none' || !examDate || examDate >= today || settings.official_result)
    return false;
  return now.getTime() - snoozedAt >= SNOOZE_MS;
}
