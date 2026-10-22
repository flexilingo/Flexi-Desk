import { cn } from '@/lib/utils';

const SIZES = {
  18: 'h-[18px] min-w-[18px] text-[9px]',
  20: 'h-5 min-w-5 text-[10px]',
  22: 'h-[22px] min-w-[22px] text-[11px]',
} as const;

/**
 * A language as its ISO code in a small badge, deliberately not a flag: flags
 * are countries, not languages, and desk shows no emoji.
 */
export function LocaleBadge({
  code,
  size = 20,
  className,
}: {
  code: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const label = (code || '').split('-')[0].slice(0, 3).toUpperCase();
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-muted px-1 font-mono font-semibold uppercase leading-none tracking-wide text-primary',
        SIZES[size],
        className,
      )}
    >
      {label}
    </span>
  );
}
