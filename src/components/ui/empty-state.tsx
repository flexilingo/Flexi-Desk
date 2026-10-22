import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  /** Say what will appear here and how to get it — never just "No data". */
  body?: string;
  action?: ReactNode;
  className?: string;
}

/** The website's empty state: a cream icon tile, a title, a line of help, one action. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center',
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-input bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground/85">{title}</p>
        {body && <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{body}</p>}
      </div>
      {action && <div className="mt-0.5">{action}</div>}
    </div>
  );
}
