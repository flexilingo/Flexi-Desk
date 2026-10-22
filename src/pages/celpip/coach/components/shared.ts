import type { LucideIcon } from 'lucide-react';
import { Headphones, BookOpen, PenLine, Mic } from 'lucide-react';
import type { CoachSkill } from '../coachTypes';

/** The dashboard cream surface. Same recipe as the results page. */
export const PANEL = `rounded-[9px] border border-border bg-card shadow-sm`;

/**
 * Per-skill classes as LITERAL strings in a Record. Tailwind's content scanner
 * reads source text, not runtime values — `text-${skill}-600` emits nothing and
 * the colour silently disappears in the production build.
 */
export const SKILL_TONE: Record<
  CoachSkill,
  { icon: LucideIcon; text: string; bg: string; border: string; stripe: string }
> = {
  listening: {
    icon: Headphones,
    text: 'text-primary',
    bg: 'bg-primary/[0.12]',
    border: 'border-primary/40',
    stripe: 'bg-gradient-to-r from-primary to-primary/70',
  },
  reading: {
    icon: BookOpen,
    text: 'text-primary',
    bg: 'bg-primary/[0.12]',
    border: 'border-primary/40',
    stripe: 'bg-gradient-to-r from-primary to-primary/70',
  },
  writing: {
    icon: PenLine,
    text: 'text-primary',
    bg: 'bg-primary/[0.12]',
    border: 'border-primary/40',
    stripe: 'bg-gradient-to-r from-primary to-primary/70',
  },
  speaking: {
    icon: Mic,
    text: 'text-primary',
    bg: 'bg-primary/[0.12]',
    border: 'border-primary/40',
    stripe: 'bg-gradient-to-r from-primary to-primary/70',
  },
};

export const SKILLS: CoachSkill[] = ['listening', 'reading', 'writing', 'speaking'];

/**
 * The report body is prose in the learner's language, which may be RTL, but
 * every quoted artifact — exam questions, passage spans, their own sentences,
 * corrections, drills — is English and must be laid out left-to-right.
 * Without this, a Persian reader gets scrambled quotations, and the quotations
 * are the whole reason the report is credible.
 */
export const LTR = 'ltr' as const;

export function accuracyPct(correct?: number, total?: number): number | null {
  if (!total) return null;
  return Math.round((100 * (correct ?? 0)) / total);
}

/** A single-hue lightness ramp, not one hue per part type. */
export function accuracyBar(pct: number | null): string {
  if (pct == null) return 'bg-border';
  if (pct >= 80) return 'bg-success';
  if (pct >= 60) return 'bg-success/60';
  if (pct >= 40) return 'bg-warning/70';
  return 'bg-error/70';
}

export function formatDate(value?: string | null, locale = 'en'): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function shortDate(value?: string | null, locale = 'en'): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** Turn a pattern_id slug into something readable when no name was written. */
export function prettyPattern(id?: string): string {
  if (!id) return '';
  return id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
