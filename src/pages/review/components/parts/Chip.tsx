import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'primary' | 'success' | 'muted' | 'accent';

const TONES: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success',
  muted: 'bg-muted text-muted-foreground',
  accent: 'bg-accent/10 text-accent',
};

export function Chip({
  tone = 'muted',
  icon,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold',
        TONES[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}
