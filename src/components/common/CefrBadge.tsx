import { cn } from '@/lib/utils';

type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

interface CefrBadgeProps {
  level: CefrLevel;
  className?: string;
}

const cefrColors: Record<CefrLevel, string> = {
  A1: 'bg-success/20 text-success border-success/30',
  A2: 'bg-success/30 text-success border-success/40',
  B1: 'bg-accent/20 text-accent border-accent/30',
  B2: 'bg-accent/30 text-accent border-accent/40',
  C1: 'bg-primary-dark/20 text-primary-dark border-primary-dark/30',
  C2: 'bg-primary-dark/30 text-primary-dark border-primary-dark/40',
};

export function CefrBadge({ level, className }: CefrBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold',
        cefrColors[level],
        className,
      )}
    >
      {level}
    </span>
  );
}
