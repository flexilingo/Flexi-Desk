import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'primary' | 'success' | 'muted' | 'sage';

const CHIP: Record<Tone, string> = {
  primary: 'bg-accent/10 text-accent',
  success: 'bg-success/15 text-success',
  muted: 'bg-muted text-muted-foreground',
  sage: 'bg-primary-light/10 text-primary-light',
};

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold',
        CHIP[tone],
      )}
    >
      {children}
    </span>
  );
}

/** The spinning "grading" screen shown while the user's AI reads the essay. */
export function GradingState({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6"
      role="status"
    >
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border-[3px] border-muted" />
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-accent" />
      </div>
      <div className="max-w-sm text-center">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
