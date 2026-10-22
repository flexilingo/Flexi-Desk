import { Headphones, BookOpen, PenLine, Mic } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SectionType } from '../types';

/**
 * Ported from front's results `_shared.ts`, translated to desk's Tailwind v4
 * tokens. Front's emoji per section is dropped — desk uses Lucide icons only.
 */

/** CLB 1–12 → bar width. Arbitrary values, never inline styles. */
export const CLB_WIDTH: Record<number, string> = {
  1: 'w-[8%]',
  1.5: 'w-[12%]',
  2: 'w-[16%]',
  2.5: 'w-[21%]',
  3: 'w-[25%]',
  3.5: 'w-[29%]',
  4: 'w-[33%]',
  4.5: 'w-[37%]',
  5: 'w-[42%]',
  5.5: 'w-[46%]',
  6: 'w-[50%]',
  6.5: 'w-[54%]',
  7: 'w-[58%]',
  7.5: 'w-[62%]',
  8: 'w-[66%]',
  8.5: 'w-[71%]',
  9: 'w-[75%]',
  9.5: 'w-[79%]',
  10: 'w-[83%]',
  10.5: 'w-[87%]',
  11: 'w-[91%]',
  11.5: 'w-[96%]',
  12: 'w-full',
};

export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function clbTextColor(clb: number | null): string {
  if (clb == null) return 'text-muted-foreground';
  if (clb >= 9) return 'text-success';
  if (clb >= 7) return 'text-primary';
  if (clb >= 5) return 'text-warning';
  return 'text-error';
}

export function clbBarColor(clb: number | null): string {
  if (clb == null) return 'bg-muted';
  if (clb >= 9) return 'bg-success';
  if (clb >= 7) return 'bg-primary';
  if (clb >= 5) return 'bg-warning';
  return 'bg-error';
}

/** The immigration band a CLB lands in. Keys live in the `celpip` namespace. */
export function clbToLevel(clb: number, t: (key: string) => string): string {
  if (clb >= 10) return t('results.immigrationLevels.advanced');
  if (clb >= 9) return t('results.immigrationLevels.strong');
  if (clb >= 7) return t('results.immigrationLevels.clb7');
  if (clb >= 5) return t('results.immigrationLevels.clb5');
  return t('results.immigrationLevels.below');
}

export interface SectionMeta {
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  chip: string;
}

/** One colour per skill, reused from the landing card through to the results. */
export const SECTION_META: Record<SectionType, SectionMeta> = {
  listening: {
    icon: Headphones,
    color: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/40',
    chip: 'bg-success/15 text-success',
  },
  reading: {
    icon: BookOpen,
    color: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/40',
    chip: 'bg-accent/15 text-accent',
  },
  writing: {
    icon: PenLine,
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/40',
    chip: 'bg-primary/15 text-primary',
  },
  speaking: {
    icon: Mic,
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/40',
    chip: 'bg-warning/15 text-warning',
  },
};

export const CEFR_COLORS: Record<string, string> = {
  B1: 'bg-success/15 text-success',
  B2: 'bg-success/10 text-success',
  C1: 'bg-accent/15 text-accent',
  C2: 'bg-accent/10 text-accent',
};

export const POS_LABELS: Record<string, string> = {
  noun: 'n.',
  verb: 'v.',
  adjective: 'adj.',
  adverb: 'adv.',
  phrase: 'phr.',
};

/** `round(x * 10) / 10` — the rounding front uses for every average and delta. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Mean of the present values, or null when nothing qualifies. */
export function meanOf(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return round1(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// ── Score scale (exam profile) ────────────────────────────────────────────────
// How a band is written and drawn. CLB_SCALE is exactly what these components
// always did ("/ 12 CLB", CLB_WIDTH); TCF gets NCLC out of 10, raw scores out of
// 699 / 20, criteria out of 20, and the CEFR exams a letter with no denominator.
// Ported from front's results `_shared.ts` (ScoreScale / scaleFromProfile).

// NCLC 3 (below the table) … 10+ → literal widths out of 10.
const NCLC_WIDTH: Record<number, string> = {
  3: 'w-[30%]',
  4: 'w-[40%]',
  5: 'w-[50%]',
  6: 'w-[60%]',
  7: 'w-[70%]',
  8: 'w-[80%]',
  9: 'w-[90%]',
  10: 'w-full',
};

// 0–20 → literal widths (TCF examiner criteria).
const SCORE20_WIDTH: Record<number, string> = {
  0: 'w-0',
  1: 'w-[5%]',
  2: 'w-[10%]',
  3: 'w-[15%]',
  4: 'w-[20%]',
  5: 'w-[25%]',
  6: 'w-[30%]',
  7: 'w-[35%]',
  8: 'w-[40%]',
  9: 'w-[45%]',
  10: 'w-[50%]',
  11: 'w-[55%]',
  12: 'w-[60%]',
  13: 'w-[65%]',
  14: 'w-[70%]',
  15: 'w-[75%]',
  16: 'w-[80%]',
  17: 'w-[85%]',
  18: 'w-[90%]',
  19: 'w-[95%]',
  20: 'w-full',
};

// CEFR level index 0–5 → literal widths out of 6.
const CEFR_WIDTH: Record<number, string> = {
  0: 'w-[17%]',
  1: 'w-[33%]',
  2: 'w-[50%]',
  3: 'w-[67%]',
  4: 'w-[83%]',
  5: 'w-full',
};

// Colour ramp only: spreads the six CEFR levels over the CLB colour thresholds.
// A COLOUR, never a score — no CEFR↔CLB/NCLC equivalence is published or implied.
const CEFR_TONE: Record<number, number> = { 0: 2, 1: 4, 2: 6, 3: 8, 4: 10, 5: 12 };

const CEFR_LEVEL_NAMES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export interface ScoreScale {
  bandLabel: string;
  bandMax: number;
  /** 'number': a stored band, written "7 / 12 CLB". 'level': a CEFR letter derived from the raw score, written alone. */
  bandKind: 'number' | 'level';
  /** Band as written ("7", "< 4" for TCF's below-table value, or "B2"). */
  format: (n: number) => string;
  bandWidth: (n: number | null) => string;
  /** The value the tone helpers (clbTextColor / clbBarColor) read. */
  toneScore: (n: number | null) => number | null;
  /** Max raw score per section; null/absent = not shown. */
  rawMax: Partial<Record<SectionType, number | null>>;
  criterionMax: number;
  /** Where the examiner's task_index starts (CELPIP 0, TCF 1). */
  taskIndexBase: 0 | 1;
  /** lang attribute for exam content (undefined = none, as CELPIP always had). */
  contentLang?: string;
  /** Listening/reading are one question per part (TCF): review as one list. */
  itemsMode: boolean;
}

export const CLB_SCALE: ScoreScale = {
  bandLabel: 'CLB',
  bandMax: 12,
  bandKind: 'number',
  format: (n) => String(n),
  bandWidth: (n) => (n != null ? (CLB_WIDTH[n] ?? 'w-0') : 'w-0'),
  toneScore: (n) => n,
  rawMax: {},
  criterionMax: 12,
  taskIndexBase: 0,
  contentLang: undefined,
  itemsMode: false,
};

/** The scale an exam profile reports in. Structural so it never imports the profile module's runtime. */
export function scaleFromProfile(profile: {
  examType: string;
  band: { label: string; max: number; belowTableValue: number | null; kind: 'number' | 'level' };
  rawScoreMax: Record<SectionType, number | null>;
  criterionMax: number;
  taskIndexBase: 0 | 1;
  contentLang: string;
  listeningMode: string;
}): ScoreScale {
  if (profile.examType === 'celpip') return CLB_SCALE;
  const below = profile.band.belowTableValue;
  const common = {
    bandLabel: profile.band.label,
    bandMax: profile.band.max,
    rawMax: profile.rawScoreMax,
    criterionMax: profile.criterionMax,
    taskIndexBase: profile.taskIndexBase,
    contentLang: profile.contentLang,
    itemsMode: profile.listeningMode === 'items',
  };
  if (profile.band.kind === 'level') {
    return {
      ...common,
      bandKind: 'level',
      format: (n) => CEFR_LEVEL_NAMES[n] ?? '–',
      bandWidth: (n) => (n != null ? (CEFR_WIDTH[n] ?? 'w-0') : 'w-0'),
      toneScore: (n) => (n != null ? (CEFR_TONE[n] ?? null) : null),
    };
  }
  return {
    ...common,
    bandKind: 'number',
    format: (n) => (below != null && n <= below ? `< ${below + 1}` : String(n)),
    bandWidth: (n) => (n != null ? (NCLC_WIDTH[Math.min(10, Math.max(3, n))] ?? 'w-0') : 'w-0'),
    toneScore: (n) => n,
  };
}

/** Criterion bar width on its own scale (CLB 0–12 or TCF 0–20). */
export function criterionWidth(score: number, max: number): string {
  if (max === 12) return CLB_WIDTH[score] ?? 'w-0';
  return SCORE20_WIDTH[Math.max(0, Math.min(20, Math.round(score)))] ?? 'w-0';
}

/** A criterion score mapped onto the 0–12 tone thresholds. */
export function criterionToneScore(score: number, max: number): number {
  return max === 12 ? score : Math.round((score * 12) / max);
}
