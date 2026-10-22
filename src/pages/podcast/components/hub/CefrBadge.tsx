import { cn } from '@/lib/utils';
import type { CefrLevel } from '../../types';

const CEFR_COLORS: Record<CefrLevel, string> = {
  A1: 'bg-cefr-a1 text-white',
  A2: 'bg-cefr-a2 text-white',
  B1: 'bg-cefr-b1 text-white',
  B2: 'bg-cefr-b2 text-white',
  C1: 'bg-cefr-c1 text-white',
  C2: 'bg-cefr-c2 text-white',
};

/** The website's podcast CEFR badge: a solid level colour with white text. */
export function CefrBadge({
  level,
  size = 'sm',
  label,
}: {
  level: CefrLevel | null | undefined;
  size?: 'sm' | 'md';
  label?: string;
}) {
  if (!level) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-semibold',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        CEFR_COLORS[level] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {label ?? level}
    </span>
  );
}
