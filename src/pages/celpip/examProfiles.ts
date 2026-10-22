/**
 * One source for everything the exam UI does differently per exam type.
 *
 * Ported from flexi-lingo-front `src/features/exam/examProfiles.ts` (the web's
 * client half of core `functions/exam/services/exam-profiles.ts`): clocks,
 * labels, the band scale, the recording folder, how listening and writing run,
 * and which extras exist.
 *
 * Desk adaptations: `ns` names the i18n namespace the profile's keys live in
 * (CELPIP's strings are in `celpip`, the TCF family's in `exam`), and the
 * section ids reuse `SectionType`. The CELPIP entry reproduces what the desk
 * engine did before profiles existed; anything unknown falls back to it.
 */
import type { SectionType } from './types';

export type SkillKey = SectionType;

export const SUPPORTED_EXAM_TYPES = ['celpip', 'tcf', 'tcf_quebec', 'tcf_irn'] as const;
export type ExamType = (typeof SUPPORTED_EXAM_TYPES)[number];

export function isSupportedExamType(value: unknown): value is ExamType {
  return typeof value === 'string' && (SUPPORTED_EXAM_TYPES as readonly string[]).includes(value);
}

/** CELPIP section clocks (the section components read the same constants). */
export const CELPIP_LISTENING_TIME_LIMIT_SEC = 55 * 60;
export const CELPIP_READING_TIME_LIMIT_SEC = 55 * 60;

/** Parts per section in a full CELPIP test — mirrors the start dialog's picker. */
export const CELPIP_SECTION_PART_COUNT: Record<SkillKey, number> = {
  listening: 6,
  reading: 4,
  writing: 2,
  speaking: 8,
};

export interface BandScale {
  label: 'CLB' | 'NCLC' | 'CEFR';
  min: number;
  max: number;
  /** A stored value at or below this means "below the table" (TCF: 3 → "< 4"). */
  belowTableValue: number | null;
  /**
   * 'number' — the backend stored a band (CLB 1–12, NCLC 3–10), shown as "7 / 12 CLB".
   * 'level'  — the backend stored NO band (clb_score is NULL): the CEFR letter is
   *   derived from the raw score on read and shown on its own.
   */
  kind: 'number' | 'level';
}

/** CEFR levels, weakest first. The index is what `cefrIndexFromRaw` returns. */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/**
 * The OFFICIAL TCF score → CEFR grid for the declensions that report a level
 * (TCF Québec, TCF IRN) — France Éducation international, "Manuel du candidat",
 * Version E, décembre 2022, p. 24. A QCM score of exactly 100 / a 0/20 is "A1
 * non atteint": no level, never A1.
 */
const CEFR_MCQ_BANDS: readonly [number, number, CefrLevel][] = [
  [101, 199, 'A1'],
  [200, 299, 'A2'],
  [300, 399, 'B1'],
  [400, 499, 'B2'],
  [500, 599, 'C1'],
  [600, 699, 'C2'],
];
const CEFR_TASK_BANDS: readonly [number, number, CefrLevel][] = [
  [1, 1, 'A1'],
  [2, 5, 'A2'],
  [6, 9, 'B1'],
  [10, 13, 'B2'],
  [14, 17, 'C1'],
  [18, 20, 'C2'],
];

/**
 * The Québec immigration points a TCF Québec result is worth — the province's
 * own barème applied to the CEFR level each skill reached (Manuel du candidat,
 * FEI, Version L, avril 2025, p. 17). Shown beside the level, never instead.
 */
export interface QuebecPointsTable {
  oral: Record<CefrLevel, number>;
  written: Record<CefrLevel, number>;
  max: number;
  /** exam-namespace key of the "source + date" line printed under the points. */
  sourceKey: string;
}

const QUEBEC_POINTS: QuebecPointsTable = {
  oral: { A1: 0, A2: 0, B1: 0, B2: 5, C1: 6, C2: 7 },
  written: { A1: 0, A2: 0, B1: 0, B2: 1, C1: 1, C2: 1 },
  max: 16,
  sourceKey: 'tcfQuebec.pointsSource',
};

const QUEBEC_ORAL_SKILLS: readonly SkillKey[] = ['listening', 'speaking'];

/** Points for one skill at one level index; null when the skill was not sat. */
export function quebecPointsFor(
  table: QuebecPointsTable,
  skill: SkillKey,
  levelIndex: number | null | undefined,
): number | null {
  if (levelIndex == null) return null;
  const level = CEFR_LEVELS[levelIndex];
  if (!level) return null;
  return QUEBEC_ORAL_SKILLS.includes(skill) ? table.oral[level] : table.written[level];
}

/** Index into CEFR_LEVELS for a section's raw score, or null for "below A1". */
export function cefrIndexFromRaw(skill: SkillKey, raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  const bands = skill === 'listening' || skill === 'reading' ? CEFR_MCQ_BANDS : CEFR_TASK_BANDS;
  const score = Math.round(raw);
  const hit = bands.find(([from, to]) => score >= from && score <= to);
  return hit ? CEFR_LEVELS.indexOf(hit[2]) : null;
}

/** The whole sitting: the LOWEST level reached. One section below A1 → null. */
export function cefrOverallIndex(indices: (number | null)[]): number | null {
  if (indices.length === 0) return null;
  if (indices.some((i) => i == null)) return null;
  return Math.min(...(indices as number[]));
}

export interface ScoringInfoSpec {
  sections: {
    titleKey: string;
    bodyKeys: string[];
    table?: 'celpip_mcq' | 'tcf_nclc' | 'tcf_cefr';
  }[];
  sourceKey: string;
}

const TCF_PRODUCTIVE_SECTION = {
  titleKey: 'scoringInfo.tcf.prodTitle',
  bodyKeys: ['scoringInfo.tcf.prod'],
};

export interface PracticeChoice {
  label: string;
  /** The parts' `part_index` values sent to start_practice. */
  partIndices: number[];
}

export interface ExamUiProfile {
  examType: ExamType;
  /** Namespace the profile's keys live in: CELPIP's `celpip`, the TCF family's `exam`. */
  ns: 'celpip' | 'exam';
  titleKey: string;
  resultsTitleKey: string;
  /** One line on the exam hub saying what this exam is FOR. */
  hubDescriptionKey: string;
  /** The line under the title in the start dialog (single-mode exams). */
  startDialogDescriptionKey: string;
  /** "~2 h 47 min" for the meta row. */
  durationShortKey: string;
  /** Caption over the big number on the results hero. */
  overallLabelKey: string;
  /** Prefix of the section intro copy: `${prefix}.${section}.title` … */
  sectionIntroPrefix: string;
  sectionLabelKeys: Record<SkillKey, string>;
  /** Short progress-pill labels (official abbreviations, not translated). */
  sectionShortLabels: Record<SkillKey, string>;
  /** Section clock in seconds; null = the clock comes from the task content. */
  sectionTimeLimitSec: Record<SkillKey, number | null>;
  /** Whole sitting, minutes. */
  totalMinutes: number;
  sectionPartCount: Record<SkillKey, number>;
  band: BandScale;
  /** Max raw score shown next to the band; null = not shown. */
  rawScoreMax: Record<SkillKey, number | null>;
  /** Scale the AI examiner uses per criterion. */
  criterionMax: number;
  /** Where task_index starts in the examiner's per-task feedback (CELPIP 0, TCF 1). */
  taskIndexBase: 0 | 1;
  /** Storage folder under `<user>/` for speaking recordings. */
  recordingSegment: 'celpip' | 'tcf' | 'tcf_quebec' | 'tcf_irn';
  /** 'parts': CELPIP parts with several questions each. 'items': one question per part. */
  listeningMode: 'parts' | 'items';
  readingMode: 'parts' | 'items';
  /** 'per_task': one clock per task. 'shared': one section clock, free navigation. */
  writingClock: 'per_task' | 'shared';
  /** A task with no prep time starts recording at once instead of after a zero countdown. */
  speakingStartsWithoutPrep: boolean;
  /** Language of the exam content (lang attribute, Whisper language). */
  contentLang: 'en' | 'fr';
  /** Estimated-score note on the results page; null = no note (CELPIP). */
  estimateNoteKey: string | null;
  scoringInfo: ScoringInfoSpec;
  /** CEFR exams: the level index for a section's raw score. */
  cefrIndexFromRaw?: (skill: SkillKey, raw: number | null | undefined) => number | null;
  /** Québec immigration points per CEFR level — TCF Québec only. */
  quebecPoints?: QuebecPointsTable;
  /** 'comingSoon': the card says what the exam is but nobody can start it. */
  hubStatus: 'available' | 'comingSoon';
  /** What the practice picker offers per section when the parts are not CELPIP's named parts. */
  practiceParts?: Record<SkillKey, PracticeChoice[]>;
  features: {
    practice: boolean;
    learning: boolean;
    coach: boolean;
    insight: boolean;
    vocab: boolean;
  };
}

const CELPIP_PROFILE: ExamUiProfile = {
  examType: 'celpip',
  ns: 'celpip',
  titleKey: 'celpip.title',
  resultsTitleKey: 'results.title',
  hubDescriptionKey: 'celpip.description',
  overallLabelKey: 'mScoreLabel',
  hubStatus: 'available',
  startDialogDescriptionKey: 'celpip.description',
  durationShortKey: 'duration',
  sectionIntroPrefix: 'sectionIntro',
  sectionLabelKeys: {
    listening: 'listening',
    reading: 'reading',
    writing: 'writing',
    speaking: 'speaking',
  },
  sectionShortLabels: { listening: 'L', reading: 'R', writing: 'W', speaking: 'S' },
  sectionTimeLimitSec: {
    listening: CELPIP_LISTENING_TIME_LIMIT_SEC,
    reading: CELPIP_READING_TIME_LIMIT_SEC,
    writing: null,
    speaking: null,
  },
  totalMinutes: 180,
  sectionPartCount: CELPIP_SECTION_PART_COUNT,
  band: { label: 'CLB', min: 1, max: 12, belowTableValue: null, kind: 'number' },
  rawScoreMax: { listening: null, reading: null, writing: null, speaking: null },
  criterionMax: 12,
  taskIndexBase: 0,
  recordingSegment: 'celpip',
  listeningMode: 'parts',
  readingMode: 'parts',
  writingClock: 'per_task',
  speakingStartsWithoutPrep: false,
  contentLang: 'en',
  estimateNoteKey: null,
  scoringInfo: {
    sections: [
      {
        titleKey: 'scoringInfo.celpip.mcqTitle',
        bodyKeys: [
          'scoringInfo.celpip.mcqPoints',
          'scoringInfo.celpip.mcqChart',
          'scoringInfo.celpip.mcqDifficulty',
          'scoringInfo.celpip.mcqSlice',
        ],
        table: 'celpip_mcq',
      },
      {
        titleKey: 'scoringInfo.celpip.prodTitle',
        bodyKeys: ['scoringInfo.celpip.prodCriteria', 'scoringInfo.celpip.prodAverage'],
      },
      { titleKey: 'scoringInfo.overallTitle', bodyKeys: ['scoringInfo.celpip.overall'] },
    ],
    sourceKey: 'scoringInfo.celpip.source',
  },
  features: { practice: true, learning: true, coach: true, insight: true, vocab: true },
};

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The 39 CO/CE items run easy → hard, so a slice of them is a level (FEI's grid: items 1–4 ≈ A1 … 36–39 ≈ C2). */
export const TCF_ITEM_BANDS: PracticeChoice[] = [
  { label: 'Questions 1–10 · A1–A2', partIndices: range(1, 10) },
  { label: 'Questions 11–19 · B1', partIndices: range(11, 19) },
  { label: 'Questions 20–29 · B2', partIndices: range(20, 29) },
  { label: 'Questions 30–39 · C1–C2', partIndices: range(30, 39) },
];

const TCF_PROFILE: ExamUiProfile = {
  examType: 'tcf',
  ns: 'exam',
  titleKey: 'tcf.title',
  resultsTitleKey: 'tcf.resultsTitle',
  hubDescriptionKey: 'tcf.hubDescription',
  overallLabelKey: 'mScoreLabel',
  hubStatus: 'available',
  startDialogDescriptionKey: 'tcf.startDialogDescription',
  durationShortKey: 'tcf.durationShort',
  sectionIntroPrefix: 'tcf.sectionIntro',
  sectionLabelKeys: {
    listening: 'tcf.sections.listening',
    reading: 'tcf.sections.reading',
    writing: 'tcf.sections.writing',
    speaking: 'tcf.sections.speaking',
  },
  sectionShortLabels: { listening: 'CO', reading: 'CE', writing: 'EE', speaking: 'EO' },
  sectionTimeLimitSec: { listening: 35 * 60, reading: 60 * 60, writing: 60 * 60, speaking: null },
  totalMinutes: 35 + 60 + 60 + 12,
  sectionPartCount: { listening: 39, reading: 39, writing: 3, speaking: 3 },
  band: { label: 'NCLC', min: 3, max: 10, belowTableValue: 3, kind: 'number' },
  rawScoreMax: { listening: 699, reading: 699, writing: 20, speaking: 20 },
  criterionMax: 20,
  taskIndexBase: 1,
  recordingSegment: 'tcf',
  listeningMode: 'items',
  readingMode: 'items',
  writingClock: 'shared',
  speakingStartsWithoutPrep: true,
  contentLang: 'fr',
  estimateNoteKey: 'tcf.estimateNote',
  scoringInfo: {
    sections: [
      {
        titleKey: 'scoringInfo.tcf.mcqTitle',
        bodyKeys: [
          'scoringInfo.tcf.mcq39',
          'scoringInfo.tcf.mcqEstimate',
          'scoringInfo.tcf.mcqSlice',
        ],
      },
      TCF_PRODUCTIVE_SECTION,
      {
        titleKey: 'scoringInfo.tcf.nclcTitle',
        bodyKeys: ['scoringInfo.tcf.nclc'],
        table: 'tcf_nclc',
      },
    ],
    sourceKey: 'scoringInfo.tcf.source',
  },
  practiceParts: {
    listening: TCF_ITEM_BANDS,
    reading: TCF_ITEM_BANDS,
    writing: [
      { label: 'Tâche 1 — Message', partIndices: [1] },
      { label: 'Tâche 2 — Article ou courrier', partIndices: [2] },
      { label: 'Tâche 3 — Deux points de vue', partIndices: [3] },
    ],
    speaking: [
      { label: 'Tâche 1 — Entretien dirigé', partIndices: [1] },
      { label: 'Tâche 2 — Exercice en interaction', partIndices: [2] },
      { label: 'Tâche 3 — Point de vue', partIndices: [3] },
    ],
  },
  // Learning mode is CELPIP's. The AI insight has no server home for TCF (the backend
  // answers EXAM_FEATURE_UNAVAILABLE), so on desk it is written by the user's OWN AI
  // (local model or own key) with TCF-aware prompts - never by the cloud.
  features: { practice: true, learning: false, coach: false, insight: true, vocab: false },
};

/**
 * TCF Québec — the SAME paper as TCF Canada (so everything about how it RUNS is
 * inherited). The report differs: a CEFR level derived from the raw score plus
 * the province's points, and no NCLC anywhere.
 */
const TCF_QUEBEC_PROFILE: ExamUiProfile = {
  ...TCF_PROFILE,
  examType: 'tcf_quebec',
  titleKey: 'tcfQuebec.title',
  resultsTitleKey: 'tcfQuebec.resultsTitle',
  hubDescriptionKey: 'tcfQuebec.hubDescription',
  overallLabelKey: 'overallLevel',
  startDialogDescriptionKey: 'tcfQuebec.startDialogDescription',
  band: {
    label: 'CEFR',
    min: 0,
    max: CEFR_LEVELS.length - 1,
    belowTableValue: null,
    kind: 'level',
  },
  recordingSegment: 'tcf_quebec',
  estimateNoteKey: 'tcfQuebec.estimateNote',
  scoringInfo: {
    sections: [
      {
        titleKey: 'scoringInfo.tcf.mcqTitle',
        bodyKeys: [
          'scoringInfo.tcf.mcq39',
          'scoringInfo.tcf.mcqEstimate',
          'scoringInfo.tcf.mcqSlice',
        ],
      },
      TCF_PRODUCTIVE_SECTION,
      {
        titleKey: 'scoringInfo.tcf.levelTitle',
        bodyKeys: ['scoringInfo.tcf.cefr', 'scoringInfo.tcf.quebecPoints'],
        table: 'tcf_cefr',
      },
    ],
    sourceKey: 'scoringInfo.tcf.sourceQuebec',
  },
  cefrIndexFromRaw,
  quebecPoints: QUEBEC_POINTS,
};

/**
 * TCF IRN — a DIFFERENT, shorter paper (CO 25 q / 20 min, CE 25 q / 35 min,
 * EE 3 / 30 min, EO 3 / 10 min; QCM reported 100–499). `hubStatus` is
 * 'comingSoon' exactly as on the web: IRN's own writing and speaking prompts do
 * not exist yet, so the card says what the exam is and does not open. Switching
 * it on later is this one field (plus `features.practice` / `practiceParts`).
 */
const TCF_IRN_PROFILE: ExamUiProfile = {
  ...TCF_PROFILE,
  examType: 'tcf_irn',
  titleKey: 'tcfIrn.title',
  resultsTitleKey: 'tcfIrn.resultsTitle',
  hubDescriptionKey: 'tcfIrn.hubDescription',
  overallLabelKey: 'overallLevel',
  startDialogDescriptionKey: 'tcfIrn.startDialogDescription',
  durationShortKey: 'tcfIrn.durationShort',
  sectionTimeLimitSec: { listening: 20 * 60, reading: 35 * 60, writing: 30 * 60, speaking: null },
  totalMinutes: 20 + 35 + 30 + 10,
  sectionPartCount: { listening: 25, reading: 25, writing: 3, speaking: 3 },
  band: {
    label: 'CEFR',
    min: 0,
    max: CEFR_LEVELS.length - 1,
    belowTableValue: null,
    kind: 'level',
  },
  rawScoreMax: { listening: 499, reading: 499, writing: 20, speaking: 20 },
  recordingSegment: 'tcf_irn',
  estimateNoteKey: 'tcfIrn.estimateNote',
  scoringInfo: {
    sections: [
      {
        titleKey: 'scoringInfo.tcf.mcqTitle',
        bodyKeys: [
          'scoringInfo.tcf.mcq25',
          'scoringInfo.tcf.mcqEstimate',
          'scoringInfo.tcf.mcqSlice',
        ],
      },
      TCF_PRODUCTIVE_SECTION,
      {
        titleKey: 'scoringInfo.tcf.levelTitle',
        bodyKeys: ['scoringInfo.tcf.cefr'],
        table: 'tcf_cefr',
      },
    ],
    sourceKey: 'scoringInfo.tcf.sourceIrn',
  },
  cefrIndexFromRaw,
  hubStatus: 'comingSoon',
  practiceParts: undefined,
  features: { ...TCF_PROFILE.features, practice: false },
};

const PROFILES: Record<ExamType, ExamUiProfile> = {
  celpip: CELPIP_PROFILE,
  tcf: TCF_PROFILE,
  tcf_quebec: TCF_QUEBEC_PROFILE,
  tcf_irn: TCF_IRN_PROFILE,
};

export function getExamProfile(examType: string | null | undefined): ExamUiProfile {
  return isSupportedExamType(examType) ? PROFILES[examType] : CELPIP_PROFILE;
}

/** Band value as shown: TCF Canada's "below NCLC 4" (stored 3) reads "< 4"; a CEFR exam gets its letter. */
export function formatBand(profile: ExamUiProfile, value: number | null | undefined): string {
  if (value == null) return '–';
  if (profile.band.kind === 'level') return CEFR_LEVELS[value] ?? '–';
  const below = profile.band.belowTableValue;
  if (below != null && value <= below) return `< ${below + 1}`;
  return String(value);
}

/**
 * The clock for a section of THIS session. A section clock belongs to the whole
 * paper (TCF CO: 35 min for 39 items); a practice slice gets the same pace for
 * what it holds (ten CO items ≈ 9 min), never less than a minute. `held` and
 * `paper` are counted in the same unit as `sectionPartCount` (parts for CELPIP,
 * items for TCF).
 */
export function sectionClockSeconds(
  profile: ExamUiProfile,
  section: SkillKey,
  isPractice: boolean,
  held: number | undefined,
): number {
  const full = profile.sectionTimeLimitSec[section] ?? 0;
  const paper = profile.sectionPartCount[section];
  if (!isPractice || !full || !paper || !held || held >= paper) return full;
  return Math.max(60, Math.round((full * held) / paper));
}

/** "~2 h 47 min" building blocks. */
export function splitMinutes(total: number): { hours: number; minutes: number } {
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/**
 * Route prefix for an exam type: `/exam/tcf`. `/celpip/*` stays as an alias that
 * mounts the same pages, so old links and the dashboard's shortcuts keep working.
 */
export function examBase(examType: string | null | undefined): string {
  return `/exam/${isSupportedExamType(examType) ? examType : 'celpip'}`;
}
