import * as React from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * The website's filter design system (flexi-lingo-front `ui/filters/*`): a segmented cream box of
 * triggers, terra marking the one thing the user changed, one reset at the end of the bar and a
 * line of removable chips under it. Semantic tokens so it follows light and dark.
 */

const triggerBase =
  'inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors';
const triggerActive = 'bg-accent/15 text-accent';
const triggerIdle = 'text-muted-foreground hover:bg-muted hover:text-foreground';
const menuShell =
  'w-auto min-w-[170px] max-w-[min(18rem,calc(100vw-2rem))] rounded-[9px] border border-border bg-popover p-1 shadow-lg';
const menuItem =
  'w-full truncate rounded-[7px] px-2.5 py-1.5 text-start text-[13px] font-medium transition-colors';
const menuItemActive = 'bg-accent/15 text-accent';
const menuItemIdle = 'text-muted-foreground hover:bg-muted hover:text-foreground';

/** Above this many options the menu grows a search box. */
const SEARCH_THRESHOLD = 12;

export interface FilterOption {
  id: string;
  label: string;
  /** Leading mark (icon / language badge), shown in the menu row and, when chosen, in the trigger. */
  icon?: React.ReactNode;
  /** How many items picking this would show, dimmed at the end of the menu row. */
  count?: number;
}

/* ── group registry: lets a FilterGroup know which of its filters are on ── */

interface Entry {
  isActive: boolean;
  clear: () => void;
}
interface Registry {
  register: (id: string, e: Entry) => void;
  update: (id: string, isActive: boolean) => void;
  unregister: (id: string) => void;
  activeCount: number;
  clearAll: () => void;
}
const NOOP: Registry = {
  register: () => {},
  update: () => {},
  unregister: () => {},
  activeCount: 0,
  clearAll: () => {},
};
const FilterContext = React.createContext<Registry>(NOOP);

function FilterProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = React.useState<Map<string, Entry>>(() => new Map());
  const register = React.useCallback((id: string, e: Entry) => {
    setEntries((prev) => new Map(prev).set(id, e));
  }, []);
  const update = React.useCallback((id: string, isActive: boolean) => {
    setEntries((prev) => {
      const cur = prev.get(id);
      if (!cur || cur.isActive === isActive) return prev;
      return new Map(prev).set(id, { ...cur, isActive });
    });
  }, []);
  const unregister = React.useCallback((id: string) => {
    setEntries((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const value = React.useMemo<Registry>(() => {
    let activeCount = 0;
    entries.forEach((e) => {
      if (e.isActive) activeCount += 1;
    });
    return {
      register,
      update,
      unregister,
      activeCount,
      clearAll: () => entries.forEach((e) => e.clear()),
    };
  }, [entries, register, update, unregister]);
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

function useRegisterFilter(isActive: boolean, clear: () => void) {
  const registry = React.useContext(FilterContext);
  const id = React.useId();
  const clearRef = React.useRef(clear);
  clearRef.current = clear;
  React.useEffect(() => {
    registry.register(id, { isActive, clear: () => clearRef.current() });
    return () => registry.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  React.useEffect(() => {
    registry.update(id, isActive);
  }, [registry, id, isActive]);
}

/* ── layout ─────────────────────────────────────────────────────────────── */

export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

function GroupClearButton({ label }: { label: string }) {
  const { activeCount, clearAll } = React.useContext(FilterContext);
  if (activeCount === 0) return null;
  return (
    <button
      type="button"
      onClick={clearAll}
      aria-label={label}
      className="ms-0.5 inline-flex items-center gap-1 self-stretch border-s border-border ps-2 pe-1 text-[12px] font-medium text-caption transition-colors hover:text-accent"
    >
      <X className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function FilterGroup({
  children,
  className,
  clearable = true,
  clearLabel = 'Clear',
}: {
  children: React.ReactNode;
  className?: string;
  clearable?: boolean;
  clearLabel?: string;
}) {
  const box = (
    <div
      className={cn(
        'inline-flex max-w-full flex-wrap items-center gap-1 rounded-[9px] border border-border bg-card p-1.5',
        className,
      )}
    >
      {children}
      {clearable && <GroupClearButton label={clearLabel} />}
    </div>
  );
  return clearable ? <FilterProvider>{box}</FilterProvider> : box;
}

/* ── controls ───────────────────────────────────────────────────────────── */

export interface FilterPillsOption {
  id: string;
  label: string;
  /** Secondary word after the label, dimmed ("A1 · Beginner"). */
  sublabel?: string;
  /** Small always-visible colour mark: the only place a per-option hue is allowed. */
  dotClass?: string;
  /** Overrides the active styling for this one option (its CEFR colour). */
  activeClass?: string;
  count?: number;
}

export function FilterPills({
  value,
  options,
  onChange,
  toggleable = false,
  sublabelMode = 'always',
  className,
}: {
  value: string;
  options: FilterPillsOption[];
  onChange: (id: string) => void;
  /** Clicking the chosen pill clears it back to "". */
  toggleable?: boolean;
  /** "active" keeps the row to one line: the descriptive word shows only on the chosen pill. */
  sublabelMode?: 'always' | 'active';
  className?: string;
}) {
  return (
    <FilterGroup className={className} clearable={false}>
      {options.map((o) => {
        const active = value === o.id;
        const showSub = o.sublabel && (sublabelMode === 'always' || active);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            title={o.sublabel}
            onClick={() => onChange(toggleable && active ? '' : o.id)}
            className={cn(
              triggerBase,
              'shrink-0',
              active ? (o.activeClass ?? triggerActive) : triggerIdle,
            )}
          >
            {o.dotClass && <span className={cn('h-1.5 w-1.5 rounded-full', o.dotClass)} />}
            <span>{o.label}</span>
            {showSub && <span className="font-medium opacity-70">{o.sublabel}</span>}
            {o.count != null && (
              <span className="font-medium tabular-nums opacity-60">{o.count}</span>
            )}
          </button>
        );
      })}
    </FilterGroup>
  );
}

export function FilterSearch({
  value,
  onChange,
  placeholder = 'Search…',
  isFetching,
  clearLabel = 'Clear search',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Swaps the leading icon for a spinner while fetching. */
  isFetching?: boolean;
  clearLabel?: string;
  className?: string;
}) {
  const showClear = value.length > 0;
  return (
    <div className={cn('relative w-full sm:w-80', className)}>
      <div className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2">
        {isFetching ? (
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
        ) : (
          <Search className="h-4 w-4 text-caption" />
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-[9px] border border-border bg-card py-2.5 ps-9 text-[13px] text-foreground transition-colors placeholder:text-caption focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10',
          showClear ? 'pe-9' : 'pe-3',
        )}
      />
      {showClear && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={clearLabel}
          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-caption transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function FilterDropdown({
  label,
  value,
  options,
  onChange,
  allLabel = 'All',
  clearLabel = 'Clear',
  icon,
}: {
  label: string;
  /** Chosen option id, or "" for none. */
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  allLabel?: string;
  clearLabel?: string;
  /** Leading mark on the trigger while nothing is chosen. */
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const selected = options.find((o) => o.id === value);
  const isActive = Boolean(value);
  useRegisterFilter(isActive, () => onChange(''));
  const searchable = options.length > SEARCH_THRESHOLD;
  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);
  React.useEffect(() => {
    if (!open) setSearch('');
  }, [open]);
  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(triggerBase, isActive ? triggerActive : triggerIdle)}
        >
          {selected?.icon ?? icon}
          <span>{selected ? selected.label : label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} collisionPadding={12} className={menuShell}>
        {searchable && (
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={label}
              autoFocus
              className="w-full rounded-[7px] border border-border bg-muted py-1.5 pe-2 ps-7 text-[13px] text-foreground outline-none placeholder:text-caption focus:border-accent/60"
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => pick('')}
          className={cn(
            menuItem,
            'font-semibold',
            !isActive ? menuItemActive : 'text-error hover:bg-error/10',
          )}
        >
          {!isActive ? allLabel : clearLabel}
        </button>
        <div className="my-1 border-t border-border" />
        <div className={searchable ? 'max-h-[min(22rem,60vh)] overflow-y-auto' : undefined}>
          {shown.length === 0 && <p className="px-2.5 py-2 text-[13px] text-caption">—</p>}
          {shown.map((option) => {
            const active = value === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => pick(active ? '' : option.id)}
                className={cn(
                  menuItem,
                  'inline-flex items-center justify-between gap-2',
                  active ? menuItemActive : menuItemIdle,
                )}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  {option.icon}
                  {option.label}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  {option.count != null && (
                    <span className="font-medium tabular-nums opacity-60">{option.count}</span>
                  )}
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Single-select that ALWAYS holds a value (a view switcher); terra only once off its default. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  prefix,
  defaultValue,
  className,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  prefix?: string;
  defaultValue?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.id === value) ?? options[0];
  const moved = defaultValue !== undefined && value !== defaultValue;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            triggerBase,
            moved ? triggerActive : 'bg-muted text-foreground hover:bg-muted/70',
            className,
          )}
        >
          {selected?.icon}
          {prefix && <span className="font-medium opacity-70">{prefix}</span>}
          <span>{selected?.label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} collisionPadding={12} className={menuShell}>
        {options.map((option) => {
          const active = option.id === selected?.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
              className={cn(
                menuItem,
                'inline-flex items-center justify-between gap-2',
                active ? menuItemActive : menuItemIdle,
              )}
            >
              <span className="inline-flex items-center gap-2 truncate">
                {option.icon}
                {option.label}
              </span>
              {active && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export function FilterClearAll({
  show,
  onClear,
  label,
  className,
}: {
  show: boolean;
  onClear: () => void;
  label: string;
  className?: string;
}) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClear}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border border-border bg-card px-3 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent',
        className,
      )}
    >
      <X className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export interface FilterChip {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onRemove: () => void;
}

export function FilterChips({
  chips,
  summary,
  removeLabel,
}: {
  chips: FilterChip[];
  /** "787 videos match"; omitted while counting. */
  summary?: string;
  removeLabel: (name: string) => string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
      {summary && (
        <span className="me-1 text-[13px] font-semibold tabular-nums text-foreground">
          {summary}
        </span>
      )}
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={removeLabel(chip.label)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent/25"
        >
          {chip.icon}
          <span>{chip.label}</span>
          <X className="h-3 w-3 opacity-70" />
        </button>
      ))}
    </div>
  );
}
