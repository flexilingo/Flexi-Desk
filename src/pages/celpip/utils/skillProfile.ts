/**
 * How a CELPIP session turns into a number the learner is allowed to trust.
 *
 * The rule that governs everything here: an M-score is `min(L, R, W, S)` — the
 * WEAKEST of the four skills, not their average. Two consequences follow, and
 * both used to be violated on the landing page:
 *
 *  1. A session that scored only Reading has `m_score = min(reading) = reading`.
 *     That number is a section score wearing an overall's clothes. Feeding it
 *     into "Best" / "Average" alongside real exams is a category error — it is
 *     what made four single-section practices report an average of 2.5.
 *
 *  2. Because the overall is a minimum, evidence from a SUBSET of skills is an
 *     UPPER bound, never an estimate. Measuring the missing skills can only pull
 *     the overall down, never up. On our own 13 full exams the mean of the four
 *     skills sits 2.4 CLB above the official min (worst case 4.5) — so anything
 *     average-shaped over-promises by roughly two bands.
 *
 * So practice is not discarded (it is most of what learners actually do) — it
 * feeds a PER-SKILL estimate, where partial coverage is treated as weaker
 * evidence rather than as a smaller score, and the overall it implies is
 * published as a ceiling with its coverage stated.
 */

import type { ExamSession } from '../types';

export type SkillKey = 'listening' | 'reading' | 'writing' | 'speaking';

export const SKILL_KEYS: readonly SkillKey[] = ['listening', 'reading', 'writing', 'speaking'];

/** Parts per section in a full test — mirrors SECTION_PARTS in StartExamDialog. */
export const SECTION_PART_COUNT: Record<SkillKey, number> = {
  listening: 6,
  reading: 4,
  writing: 2,
  speaking: 8,
};

/**
 * Evidence half-life, in sessions. The 3rd-most-recent session that scored a
 * skill counts half as much as the newest one — recent work describes current
 * ability, but one bad morning should not erase a consistent history.
 */
const RECENCY_HALF_LIFE = 3;

export function skillScore(s: ExamSession, skill: SkillKey): number | null {
  switch (skill) {
    case 'listening':
      return s.listening_score ?? null;
    case 'reading':
      return s.reading_score ?? null;
    case 'writing':
      return s.writing_score ?? null;
    case 'speaking':
      return s.speaking_score ?? null;
  }
}

export const isLearningSession = (s: ExamSession) => s.practice_config?.learning_mode === true;

/**
 * A session whose m_score is a real overall: a timed non-practice run in which
 * all four skills actually produced a score.
 *
 * Deliberately stricter than `mode !== 'practice'` — an exam abandoned after two
 * sections is also a partial measurement, and prod has two of those.
 */
export function isFullExam(s: ExamSession): boolean {
  return (
    s.status === 'completed' &&
    s.mode !== 'practice' &&
    !isLearningSession(s) &&
    SKILL_KEYS.every((k) => skillScore(s, k) != null)
  );
}

/** Which part indices of `skill` this session actually contained (null = all of them). */
function pickedParts(s: ExamSession, skill: SkillKey): number[] | null {
  const picked = s.practice_config?.[skill];
  return Array.isArray(picked) && picked.length > 0 ? picked : null;
}

/**
 * Share of the section this session covered, 0–1. A full exam — and any practice
 * that did not record a part list — covers the whole section.
 *
 * This is the learner's own `k/N` idea, used as a weight on the EVIDENCE rather
 * than as a multiplier on the score: doing 1 of 4 reading parts makes the band
 * less certain, it does not make the learner a quarter as good.
 */
export function sessionCoverage(s: ExamSession, skill: SkillKey): number {
  const picked = pickedParts(s, skill);
  if (!picked) return 1;
  return Math.min(picked.length, SECTION_PART_COUNT[skill]) / SECTION_PART_COUNT[skill];
}

export interface SkillEstimate {
  skill: SkillKey;
  /** Coverage- and recency-weighted CLB estimate; null when never attempted. */
  estimate: number | null;
  /** Distinct parts of this section ever attempted, across all sessions. */
  partsDone: number;
  partsTotal: number;
  /** Completed sessions that produced a score for this skill. */
  sessionCount: number;
  /** Whether a real full exam contributed — practice-only estimates are softer. */
  fromFullExam: boolean;
}

export type SkillProfile = Record<SkillKey, SkillEstimate>;

const roundToHalf = (n: number) => Math.round(n * 2) / 2;

/**
 * Per-skill picture built from every completed session — practice included.
 * Learning-mode runs stay out: they are untimed with tap-to-translate, so their
 * scores measure a different task.
 */
export function buildSkillProfile(sessions: ExamSession[]): SkillProfile {
  const completed = sessions.filter((s) => s.status === 'completed' && !isLearningSession(s));

  const profile = {} as SkillProfile;

  for (const skill of SKILL_KEYS) {
    const partsSeen = new Set<number>();
    let weighted = 0;
    let weight = 0;
    let sessionCount = 0;
    let fromFullExam = false;
    // Rank counts only sessions that scored THIS skill, so the newest evidence
    // for each skill is rank 0 regardless of what the other sections did.
    let rank = 0;

    for (const s of completed) {
      const score = skillScore(s, skill);
      if (score == null) continue;

      const w = sessionCoverage(s, skill) * Math.pow(0.5, rank / RECENCY_HALF_LIFE);
      weighted += score * w;
      weight += w;
      sessionCount += 1;
      if (isFullExam(s)) fromFullExam = true;

      const picked = pickedParts(s, skill);
      if (picked) picked.forEach((p) => partsSeen.add(p));
      else for (let i = 0; i < SECTION_PART_COUNT[skill]; i++) partsSeen.add(i);

      rank += 1;
    }

    profile[skill] = {
      skill,
      estimate: weight > 0 ? roundToHalf(weighted / weight) : null,
      partsDone: Math.min(partsSeen.size, SECTION_PART_COUNT[skill]),
      partsTotal: SECTION_PART_COUNT[skill],
      sessionCount,
      fromFullExam,
    };
  }

  return profile;
}

export interface OverallEstimate {
  /** min() across the skills that have evidence; null when there is none. */
  value: number | null;
  /**
   * 'exact' once all four skills have been measured. 'upper' while any is
   * missing — the real overall is this value OR LOWER, because the unmeasured
   * skill can only drag the minimum down.
   */
  bound: 'exact' | 'upper';
  skillsCovered: number;
  missing: SkillKey[];
}

export function overallEstimate(profile: SkillProfile): OverallEstimate {
  const measured = SKILL_KEYS.map((k) => profile[k]).filter((e) => e.estimate != null);
  const missing = SKILL_KEYS.filter((k) => profile[k].estimate == null);
  return {
    value: measured.length ? Math.min(...measured.map((e) => e.estimate as number)) : null,
    bound: missing.length === 0 ? 'exact' : 'upper',
    skillsCovered: measured.length,
    missing,
  };
}

export interface OfficialStats {
  /** Full 4-section exams — the only sessions whose m_score is an overall. */
  fullExams: ExamSession[];
  /** Completed practice sessions (learning-mode runs excluded). */
  practiceCount: number;
  /** Best official M-score, or null before the first full exam. */
  best: number | null;
  /** Most recent official M-score. */
  latest: number | null;
}

/**
 * The numbers a learner could repeat to an immigration consultant. Nothing
 * partial is allowed anywhere near these.
 *
 * There is deliberately no average: an average of minimums across attempts is
 * not a score anybody reports, and it was the headline number that was wrong.
 */
export function officialStats(sessions: ExamSession[]): OfficialStats {
  const completed = sessions.filter((s) => s.status === 'completed');
  const fullExams = completed.filter(isFullExam);
  const scored = fullExams.filter((s) => s.m_score != null);
  return {
    fullExams,
    practiceCount: completed.filter((s) => !isFullExam(s) && !isLearningSession(s)).length,
    best: scored.length ? Math.max(...scored.map((s) => s.m_score as number)) : null,
    latest: scored[0]?.m_score ?? null,
  };
}
