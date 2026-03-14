import { cn } from '@/lib/utils';
import type { Algorithm } from '../types';

const ALGO_CONFIG: Record<Algorithm, { label: string; className: string }> = {
  leitner: { label: 'Leitner', className: 'bg-accent/15 text-accent' },
  sm2: { label: 'SM-2', className: 'bg-success/15 text-success' },
  fsrs: { label: 'FSRS', className: 'bg-primary/15 text-primary' },
};

export function AlgorithmBadge({ algorithm }: { algorithm: Algorithm }) {
  const config = ALGO_CONFIG[algorithm];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}
