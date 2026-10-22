import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * The library's filter controls, drawn like the website's filter bar (`components/ui/filters`):
 * one bordered box of segmented triggers, a quiet idle state and the accent only on what the
 * reader changed. The desk has no phone sheet — the bar wraps instead.
 */

const trigger =
  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors';
const triggerActive = 'bg-accent/15 text-accent';
const triggerIdle = 'text-muted-foreground hover:bg-muted hover:text-foreground';
const menuItem =
  'flex w-full items-center justify-between gap-2 truncate rounded-md px-2.5 py-1.5 text-start text-[13px] font-medium transition-colors';

/** The segmented box that groups pills or dropdowns. */
export function FilterBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface PillOption {
  id: string;
  label: string;
  /** The word shown after the label, only on the picked pill. */
  sublabel?: string;
  /** The level's own colour mark. */
  dotClass?: string;
  activeClass?: string;
}

export function FilterPills({
  value,
  options,
  onChange,
  groupLabel,
}: {
  value: string;
  options: PillOption[];
  onChange: (id: string) => void;
  groupLabel: string;
}) {
  return (
    <FilterBox>
      <div role="group" aria-label={groupLabel} className="contents">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.id)}
              className={cn(
                trigger,
                'shrink-0',
                active ? (o.activeClass ?? triggerActive) : triggerIdle,
              )}
            >
              {o.dotClass && <span className={cn('h-1.5 w-1.5 rounded-full', o.dotClass)} />}
              <span>{o.label}</span>
              {active && o.sublabel && <span className="font-medium opacity-70">{o.sublabel}</span>}
            </button>
          );
        })}
      </div>
    </FilterBox>
  );
}

export interface MenuOption {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

/** A single-select dropdown: the label until something is picked, then the pick. */
export function FilterMenu({
  label,
  value,
  options,
  onChange,
  allLabel,
  clearLabel,
  icon,
}: {
  label: string;
  value: string;
  options: MenuOption[];
  onChange: (id: string) => void;
  allLabel: string;
  clearLabel: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(trigger, value ? triggerActive : triggerIdle)}
        >
          {selected?.icon ?? icon}
          <span dir="auto">{selected ? selected.label : label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="max-h-[min(22rem,60vh)] w-auto min-w-44 max-w-72 overflow-y-auto p-1"
      >
        <button
          type="button"
          onClick={() => pick('')}
          className={cn(
            menuItem,
            'font-semibold',
            value ? 'text-error hover:bg-error/10' : triggerActive,
          )}
        >
          {value ? clearLabel : allLabel}
        </button>
        <div className="my-1 border-t border-border" />
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(active ? '' : o.id)}
              className={cn(menuItem, active ? triggerActive : triggerIdle)}
            >
              <span className="inline-flex min-w-0 items-center gap-2 truncate">
                {o.icon}
                <span className="truncate" dir="auto">
                  {o.label}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5">
                {o.count != null && <span className="tabular-nums opacity-60">{o.count}</span>}
                {active && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** The search box: types freely, the filter follows after a pause; a cross empties it. */
export function FilterSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          'w-full rounded-lg border border-border bg-card py-2.5 ps-9 text-[13px] text-foreground transition-colors placeholder:text-muted-foreground focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10 [&::-webkit-search-cancel-button]:hidden',
          value ? 'pe-9' : 'pe-3',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={placeholder}
          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Puts every filter back, search included. */
export function FilterClearAll({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
    >
      <X className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
