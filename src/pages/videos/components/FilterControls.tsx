import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { VALID_CEFR, type CefrLabel } from '../lib/videosApi';

// The website's filter design system (components/ui/filters), on the desk's semantic tokens: the
// bar is a wrapping row of segmented boxes; an idle trigger is neutral text and the accent marks
// the ONE thing the person changed.

const triggerBase =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[13px] font-semibold transition-colors';
const triggerActive = 'bg-accent/15 text-accent';
const triggerIdle = 'text-muted-foreground hover:bg-muted hover:text-foreground';
const menuItem =
  'w-full truncate rounded-[7px] px-2.5 py-1.5 text-start text-[13px] font-medium transition-colors';

/** Above this many options the menu grows a search box (the topic list runs to dozens). */
const SEARCH_THRESHOLD = 12;

const CEFR_LABEL_KEY: Record<CefrLabel, string> = {
  A1: 'cefrBeginner',
  A2: 'cefrElementary',
  B1: 'cefrIntermediate',
  B2: 'cefrUpperIntermediate',
  C1: 'cefrAdvanced',
  C2: 'cefrProficiency',
};
const CEFR_ACTIVE: Record<CefrLabel, string> = {
  A1: 'bg-cefr-a1/20 text-cefr-a1',
  A2: 'bg-cefr-a2/20 text-cefr-a2',
  B1: 'bg-cefr-b1/25 text-cefr-b1',
  B2: 'bg-cefr-b2/20 text-cefr-b2',
  C1: 'bg-cefr-c1/20 text-cefr-c1',
  C2: 'bg-cefr-c2/20 text-cefr-c2',
};
const CEFR_DOT: Record<CefrLabel, string> = {
  A1: 'bg-cefr-a1',
  A2: 'bg-cefr-a2',
  B1: 'bg-cefr-b1',
  B2: 'bg-cefr-b2',
  C1: 'bg-cefr-c1',
  C2: 'bg-cefr-c2',
};

/** A bordered box that groups several filter triggers into one segmented control. */
export function FilterGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full flex-wrap items-center gap-1 rounded-[9px] border border-border bg-card p-1.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Search box: types freely, tells the page once the person stops (2+ letters, or empty). */
export function SearchBox({
  value,
  onCommit,
  placeholder,
  busy,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder: string;
  busy?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value);
  // A reset from outside (Clear all, removing the chip) empties the box too.
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const next = text.trim();
    if (next === value || (next.length > 0 && next.length < 2)) return;
    const id = window.setTimeout(() => onCommit(next), 350);
    return () => window.clearTimeout(id);
  }, [text, value, onCommit]);

  return (
    <div className={cn('relative w-full sm:w-80', className)}>
      <div className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
        ) : (
          <Search className="h-4 w-4 text-caption" />
        )}
      </div>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          'w-full rounded-[9px] border border-border bg-card py-2.5 ps-9 text-[13px] text-foreground transition-colors placeholder:text-caption focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10',
          text ? 'pe-9' : 'pe-3',
        )}
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText('');
            onCommit('');
          }}
          aria-label="Clear"
          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-caption transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export interface DropdownOption {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

/** A filter dropdown: the label until something is picked, then the pick; the first row clears it. */
export function FilterDropdown({
  label,
  value,
  options,
  allLabel,
  clearLabel,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  allLabel?: string;
  clearLabel?: string;
  onChange: (v: string) => void;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((o) => o.id === value);
  const isActive = Boolean(value);
  const searchable = options.length > SEARCH_THRESHOLD;
  const q = search.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);
  const pick = (v: string) => {
    onChange(v);
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
          <bdi>{selected ? selected.label : label}</bdi>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="w-auto min-w-[170px] max-w-[min(18rem,calc(100vw-2rem))] rounded-[9px] border-border bg-card p-1 shadow-lg"
      >
        {searchable && (
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={label}
              aria-label={label}
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
            !isActive ? triggerActive : 'text-error hover:bg-error/10',
          )}
        >
          {!isActive ? (allLabel ?? 'All') : (clearLabel ?? allLabel ?? 'Clear')}
        </button>
        <div className="my-1 border-t border-border" />
        <div className={searchable ? 'max-h-[min(22rem,60vh)] overflow-y-auto' : undefined}>
          {shown.length === 0 && <p className="px-2.5 py-2 text-[13px] text-caption">—</p>}
          {shown.map((o) => {
            const active = value === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(active ? '' : o.id)}
                className={cn(
                  menuItem,
                  'inline-flex items-center justify-between gap-2',
                  active ? triggerActive : triggerIdle,
                )}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  {o.icon}
                  <bdi>{o.label}</bdi>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  {o.count != null && (
                    <span className="font-medium tabular-nums opacity-60">{o.count}</span>
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

/** A select that always holds a value (the view switcher): no clear row; accent only off the default. */
export function FilterSelect({
  label,
  value,
  defaultValue,
  options,
  onChange,
}: {
  label: string;
  value: string;
  defaultValue: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) ?? options[0];
  const moved = value !== defaultValue;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            triggerBase,
            moved ? triggerActive : 'bg-muted text-foreground hover:bg-muted/70',
          )}
        >
          {selected?.icon}
          <bdi>{selected?.label}</bdi>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="w-auto min-w-[170px] max-w-[min(18rem,calc(100vw-2rem))] rounded-[9px] border-border bg-card p-1 shadow-lg"
      >
        {options.map((o) => {
          const active = o.id === selected?.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={cn(
                menuItem,
                'inline-flex items-center justify-between gap-2',
                active ? triggerActive : triggerIdle,
              )}
            >
              <span className="inline-flex items-center gap-2 truncate">
                {o.icon}
                <bdi>{o.label}</bdi>
              </span>
              {active && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export interface PillOption {
  id: string;
  label: string;
  /** Secondary word after the label, dimmed. */
  sublabel?: string;
  dotClass?: string;
  activeClass?: string;
  count?: number;
}

/** Inline segmented single-select — every option visible at once. */
export function FilterPills({
  value,
  options,
  onChange,
  sublabelMode = 'always',
  className,
}: {
  value: string;
  options: PillOption[];
  onChange: (id: string) => void;
  sublabelMode?: 'always' | 'active';
  className?: string;
}) {
  return (
    <FilterGroup className={className}>
      {options.map((o) => {
        const active = value === o.id;
        const showSub = o.sublabel && (sublabelMode === 'always' || active);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            title={o.sublabel}
            onClick={() => onChange(o.id)}
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

/**
 * "All" then A1…C2 — codes only, the word shown on the level you picked. `counts` (videos per
 * level) drops the levels with none; the chosen level always stays so a link to an empty level
 * still shows what is filtering the list.
 */
export function levelPillOptions(
  t: (key: string) => string,
  opts: { counts?: Record<string, number>; total?: number; selected?: CefrLabel } = {},
): PillOption[] {
  const { counts, total, selected } = opts;
  const levels = counts
    ? VALID_CEFR.filter((l) => (counts[l] ?? 0) > 0 || l === selected)
    : VALID_CEFR;
  return [
    { id: '', label: t('podcasts.filterAllLevels'), count: counts ? total : undefined },
    ...levels.map((l) => ({
      id: l,
      label: l,
      sublabel: t(`podcasts.${CEFR_LABEL_KEY[l]}`),
      dotClass: CEFR_DOT[l],
      activeClass: CEFR_ACTIVE[l],
      count: counts ? (counts[l] ?? 0) : undefined,
    })),
  ];
}

/** Bar-level reset: every filter back to its default, search included. */
export function FilterClearAll({
  show,
  onClear,
  label,
}: {
  show: boolean;
  onClear: () => void;
  label: string;
}) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border border-border bg-card px-3 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
    >
      <X className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export interface Chip {
  key: string;
  label: string;
  icon?: ReactNode;
  onRemove: () => void;
}

/** "N videos match", then one removable chip per active filter. Nothing until a filter is chosen. */
export function FilterChips({ chips, summary }: { chips: Chip[]; summary?: string }) {
  const { t } = useTranslation('videos');
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
      {summary && (
        <span className="me-1 text-[13px] font-semibold tabular-nums text-foreground">
          {summary}
        </span>
      )}
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          aria-label={t('removeFilter', { name: c.label })}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent/25"
        >
          {c.icon}
          <bdi>{c.label}</bdi>
          <X className="h-3 w-3 opacity-70" />
        </button>
      ))}
    </div>
  );
}
