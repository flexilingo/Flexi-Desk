import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/**
 * The small row primitives the shadowing start card, normal study's tab and the
 * session's display menu all share, so they read as one form: a group with a small
 * heading, a setting picked from a few chips, an on/off switch, a hint line.
 */

/** A group: a small heading, then its settings. A hairline above every group but the first. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-caption">{title}</h3>
      {children}
    </section>
  );
}

export function RowTitle({
  icon: Icon,
  title,
  value,
}: {
  icon: LucideIcon;
  title: string;
  value?: string;
}) {
  return (
    // A span, not a div: it also sits inside a toggle's <label>.
    <span className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-caption" />
        {title}
      </span>
      {value != null && (
        <span className="text-xs font-bold tabular-nums text-primary">{value}</span>
      )}
    </span>
  );
}

export function SettingsHint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-snug text-caption">{children}</p>;
}

/** A setting picked from a few values: title, the chips, then a hint. */
export function SettingsChoice({
  icon,
  title,
  value,
  hint,
  disabled = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  value?: string;
  hint?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-2', disabled && 'opacity-60')}>
      <RowTitle icon={icon} title={title} value={value} />
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      {hint && <SettingsHint>{hint}</SettingsHint>}
    </div>
  );
}

/** One option of a single-select group: neutral, and the selection carries the colour. */
export function SettingsChoiceChip({
  active,
  disabled = false,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex h-7 min-w-9 items-center justify-center rounded-md px-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** An on/off setting. */
export function SettingsToggle({
  icon,
  title,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-start justify-between gap-3',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <span className="min-w-0">
        <RowTitle icon={icon} title={title} />
        {hint && <span className="mt-1 block text-[11px] leading-snug text-caption">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={title} />
    </label>
  );
}
