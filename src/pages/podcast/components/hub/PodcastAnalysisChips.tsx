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
    <BaseChip className="border border-[#8BB7A3]/40 bg-[#8BB7A3]/15 text-[#3d6b58] dark:text-[#a5c7b8] dark:border-[#8BB7A3]/50 dark:bg-[#8BB7A3]/20">
      {level}
    </BaseChip>
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
    <BaseChip className="border border-[#8BB7A3]/45 bg-[#8BB7A3]/18 text-[#3d6b58] dark:text-[#a5c7b8] dark:border-[#8BB7A3]/55 dark:bg-[#8BB7A3]/22">
      <Check className="h-3 w-3" />
      {label}
    </BaseChip>
  );
}

/**
 * Theme-aware gradient for premium hero / featured cards.
 * Light mode: warm cream → off-white.
 * Dark mode: subtle sage-tinted dark → slate.
 */
export const HERO_GRADIENT_LIGHT = 'from-[#fff7e6] to-[#fffef7]';
export const HERO_GRADIENT_DARK = 'from-[#8BB7A3]/12 to-[#0f172a]';
export const HERO_GRADIENT_CLASS =
  'bg-gradient-to-br from-[#fff7e6] to-[#fffef7] dark:from-[#8BB7A3]/10 dark:to-[#0f172a]';

/**
 * Common sage pill palette used for Editor's Pick, Live pill, Ready badges.
 */
export const SAGE_PILL_CLASS =
  'border border-[#8BB7A3]/45 bg-[#8BB7A3]/18 text-[#3d6b58] dark:text-[#a5c7b8] dark:border-[#8BB7A3]/55 dark:bg-[#8BB7A3]/22';
