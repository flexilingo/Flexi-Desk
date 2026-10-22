import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The single card shell every report panel uses, so the report keeps to ONE level of
 * card nesting: panels are cards, everything inside them is rows and bars.
 */
export function ReportPanel({
  title,
  note,
  children,
  className,
  testId,
}: {
  title: string;
  /** Small right-aligned qualifier — used where a panel is not a session total. */
  note?: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn('flex flex-col rounded-2xl border border-border bg-card p-4 sm:p-5', className)}
    >
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-caption">{title}</h2>
        {note && <span className="shrink-0 text-[10px] text-caption/80">{note}</span>}
      </div>
      {children}
    </div>
  );
}
