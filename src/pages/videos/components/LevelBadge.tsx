import { cn } from '@/lib/utils';
import { CEFR_BG } from '../lib/levelStyles';
import type { CefrLabel } from '../lib/videosApi';

/** The level chip on cards: solid level colour, white letters. Nothing when the level is unknown. */
export function LevelBadge({
  level,
  className,
}: {
  level: CefrLabel | string | null | undefined;
  className?: string;
}) {
  if (!level || !(level in CEFR_BG)) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none text-primary-foreground shadow-xs',
        CEFR_BG[level as CefrLabel],
        className,
      )}
    >
      {level}
    </span>
  );
}
