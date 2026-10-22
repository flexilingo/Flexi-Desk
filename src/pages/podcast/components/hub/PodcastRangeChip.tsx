import { cn } from '@/lib/utils';
import type { CefrLevel } from '../../types';

const COLORS: Record<CefrLevel, string> = {
  A1: 'bg-cefr-a1',
  A2: 'bg-cefr-a2',
  B1: 'bg-cefr-b1',
  B2: 'bg-cefr-b2',
  C1: 'bg-cefr-c1',
  C2: 'bg-cefr-c2',
};

/**
 * A podcast spans several episode levels, so it shows a band range (B1-B2), tinted by the lower
 * band; a single band when low equals high. Nothing until the show has scored episodes.
 */
export function PodcastRangeChip({
  low,
  high,
  className,
}: {
  low: CefrLevel | null | undefined;
  high: CefrLevel | null | undefined;
  className?: string;
}) {
  if (!low || !high) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide text-white',
        COLORS[low] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {low === high ? low : `${low}–${high}`}
    </span>
  );
}
