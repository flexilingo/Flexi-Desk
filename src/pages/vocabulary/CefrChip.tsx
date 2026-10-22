import { cn } from '@/lib/utils';

const tone: Record<string, string> = {
  A1: 'bg-success/12 text-success',
  A2: 'bg-success/12 text-success',
  B1: 'bg-primary-light/10 text-primary-light',
  B2: 'bg-primary-light/10 text-primary-light',
  C1: 'bg-accent/10 text-accent',
  C2: 'bg-accent/10 text-accent',
  unknown: 'bg-muted text-caption',
};

export function CefrChip({ level, className }: { level: string; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[.06em]',
        tone[level] ?? tone.unknown,
        className,
      )}
    >
      {level === 'unknown' ? '?' : level}
    </span>
  );
}
