import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CefrLevel } from '../../types';

/**
 * Small badge atoms used across the podcast hub.
 * Colors are theme-aware via dark: variants.
 */

interface ChipProps {
  children: React.ReactNode;
  className?: string;
}

function BaseChip({ children, className }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CefrChip({ level }: { level: CefrLevel | null | undefined }) {
  if (!level) return null;
  return (
    <BaseChip className="border border-success/40 bg-success/15 text-success">{level}</BaseChip>
  );
}

export function WpmChip({ wpm }: { wpm: number | null | undefined }) {
  if (!wpm) return null;
  return (
    <BaseChip className="border border-border bg-card text-muted-foreground">{wpm} WPM</BaseChip>
  );
}

export function ScoreChip({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  return <BaseChip className="border border-accent/40 bg-accent/12 text-accent">{score}</BaseChip>;
}

export function ReadyChip({ label = 'Ready' }: { label?: string }) {
  return (
    <BaseChip className="border border-success/45 bg-success/18 text-success">
      <Check className="h-3 w-3" />
      {label}
    </BaseChip>
  );
}

/**
 * Theme-aware gradient for premium hero / featured cards.
 * Light mode: warm cream → off-white.
 * Dark mode: the same tokens resolve to the dark-cream panel → background.
 */
export const HERO_GRADIENT_LIGHT = 'from-muted to-card';
export const HERO_GRADIENT_DARK = 'from-muted to-card';
export const HERO_GRADIENT_CLASS = 'bg-gradient-to-br from-muted to-card';

/**
 * Common sage pill palette used for Editor's Pick, Live pill, Ready badges.
 */
export const SAGE_PILL_CLASS = 'border border-success/45 bg-success/18 text-success';
