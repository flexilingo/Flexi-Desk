import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { VALID_CEFR, type CefrLabel } from '../lib/videosApi';
import { CEFR_BG } from '../lib/levelStyles';

const ALL = '__all__';
const CEFR_LABEL_KEY: Record<CefrLabel, string> = {
  A1: 'cefrBeginner',
  A2: 'cefrElementary',
  B1: 'cefrIntermediate',
  B2: 'cefrUpperIntermediate',
  C1: 'cefrAdvanced',
  C2: 'cefrProficiency',
};

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
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-md border border-border bg-card ps-9 pe-8 text-sm outline-none focus:ring-2 focus:ring-primary"
      />
      {busy ? (
        <Loader2 className="absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        text && (
          <button
            type="button"
            onClick={() => {
              setText('');
              onCommit('');
            }}
            aria-label="Clear"
            className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )
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

/** A filter dropdown: the label until something is picked, then the pick; "All …" clears it. */
export function FilterDropdown({
  label,
  value,
  options,
  allLabel,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  allLabel?: string;
  onChange: (v: string) => void;
  icon?: ReactNode;
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          'h-9 w-auto min-w-[8.5rem] gap-2',
          value && 'border-accent/60 text-foreground',
        )}
      >
        {/* a div, not a span: the trigger clamps its direct <span> children to one block line */}
        <div className="flex items-center gap-1.5">
          {icon}
          <SelectValue placeholder={label}>
            {selected ? <bdi>{selected.label}</bdi> : label}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span className="flex items-center gap-2">
              {o.icon}
              <span dir="auto">{o.label}</span>
              {o.count !== undefined && (
                <span className="tabular-nums text-muted-foreground">{o.count}</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "All" then A1…C2, codes only, with the word shown on the level you picked. */
export function LevelPills({
  value,
  onChange,
  counts,
}: {
  value?: CefrLabel;
  onChange: (v: CefrLabel | undefined) => void;
  /** Videos per level under the other filters; levels with none are dropped (the chosen one stays). */
  counts?: Record<string, number>;
}) {
  const { t } = useTranslation('videos');
  const levels = counts
    ? VALID_CEFR.filter((l) => (counts[l] ?? 0) > 0 || l === value)
    : VALID_CEFR;
  const base =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors';
  return (
    <div
      role="group"
      aria-label={t('podcasts.filterAllLevels')}
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-1"
    >
      <button
        type="button"
        aria-pressed={!value}
        onClick={() => onChange(undefined)}
        className={cn(
          base,
          !value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
        )}
      >
        {t('podcasts.filterAllLevels')}
      </button>
      {levels.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === l}
          onClick={() => onChange(value === l ? undefined : l)}
          className={cn(
            base,
            value === l
              ? `${CEFR_BG[l]} text-primary-foreground`
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {value !== l && <span className={cn('h-1.5 w-1.5 rounded-full', CEFR_BG[l])} />}
          {l}
          {value === l && (
            <span className="font-medium opacity-90">{t(`podcasts.${CEFR_LABEL_KEY[l]}`)}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export interface Chip {
  key: string;
  label: string;
  icon?: ReactNode;
  onRemove: () => void;
}

/** One removable chip per active filter, under an optional "N videos match" summary. */
export function FilterChips({ chips, summary }: { chips: Chip[]; summary?: string }) {
  const { t } = useTranslation('videos');
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {summary && <span className="me-1 text-sm font-semibold text-foreground">{summary}</span>}
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pe-1 ps-2.5 text-xs font-semibold text-foreground"
        >
          {c.icon}
          <bdi>{c.label}</bdi>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={t('removeFilter', { name: c.label })}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
