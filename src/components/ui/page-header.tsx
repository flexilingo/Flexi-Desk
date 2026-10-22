import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  /** Buttons for the page, sized to their content. */
  action?: ReactNode;
  className?: string;
}

/**
 * The website's page header (flexi-lingo-front `ui/page-header.tsx`): a terra
 * icon tile, a bold ink title and a subtext line, with the page's actions at
 * the end of the row.
 */
export function PageHeader({ icon: Icon, title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/12">
            <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
