import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The website's dashed empty card: a soft terra icon tile, a bold title, one explaining line. */
export function LibraryEmpty({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border-[1.5px] border-dashed border-border bg-card px-8 py-[52px] text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[12px] border border-accent/15 bg-accent/[0.07] text-accent/70">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mb-1 text-[14px] font-bold text-foreground">{title}</h3>
      {description && (
        <p className="mx-auto max-w-[320px] text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

/** Loading rows for the episode lists. */
export function RowsSkeleton() {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3.5 px-4 py-3.5">
          <div className="h-12 w-12 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/2 rounded bg-muted" />
            <div className="h-2.5 w-1/3 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A failed load: the message, then a content-sized retry. */
export function LibraryError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-border bg-card px-8 py-[52px] text-center"
    >
      <p className="mb-4 text-[13px] text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center rounded-[9px] bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
      >
        {retryLabel}
      </button>
    </div>
  );
}

/** One list row, the same shape on Saved episodes and History: artwork, title, show, detail line, badge. */
export function EpisodeRowShell({
  imageUrl,
  title,
  show,
  detail,
  trailing,
  onClick,
  disabled,
  dimmed,
  rightInset,
}: {
  imageUrl: string | null;
  title: string;
  show: string | null;
  detail: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  dimmed?: boolean;
  /** Leave room on the end side for a control that floats over the row. */
  rightInset?: boolean;
}) {
  const body = (
    <>
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Headphones className="h-5 w-5 text-caption/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="line-clamp-1 text-sm font-semibold text-foreground">{title}</h4>
        {show && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{show}</p>}
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-caption">{detail}</div>
      </div>
      <div className={cn('flex shrink-0 items-center gap-2', rightInset && 'me-12')}>
        {trailing}
      </div>
    </>
  );
  const cls = cn(
    'flex w-full items-center gap-3.5 border-b border-border px-4 py-3.5 text-start transition-colors last:border-b-0',
    dimmed ? 'opacity-60' : 'hover:bg-background',
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(cls, 'disabled:cursor-default')}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
