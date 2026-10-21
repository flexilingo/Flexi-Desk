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
  2: 'w-[16%]',
  3: 'w-[25%]',
  4: 'w-[33%]',
  5: 'w-[42%]',
  6: 'w-[50%]',
  7: 'w-[58%]',
  8: 'w-[66%]',
  9: 'w-[75%]',
  10: 'w-[83%]',
  11: 'w-[91%]',
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
