import { cn } from '@/lib/utils';
import { CEFR_BG } from '../lib/levelStyles';
import type { CefrLabel } from '../lib/videosApi';

/** The level chip on cards: solid level colour, white letters. Nothing when the level is unknown. */
export function LevelBadge({
  level,
  size = 'sm',
  className,
}: {
  level: CefrLabel | string | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (!level || !(level in CEFR_BG)) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-semibold text-white',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        CEFR_BG[level as CefrLabel],
        className,
      )}
    >
      {level}
    </span>
  );
}
