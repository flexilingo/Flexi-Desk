import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Download,
  FileJson,
  FileText,
  Filter,
  Loader2,
  Printer,
  Search,
  Star,
  Table,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { OriginFilter, SortOption } from './notesLogic';

export type ExportFormat = 'markdown' | 'csv' | 'json' | 'print';

interface Props {
  query: string;
  onQuery: (v: string) => void;
  sort: SortOption;
  onSort: (v: SortOption) => void;
  origin: OriginFilter;
  onOrigin: (v: OriginFilter) => void;
  showOrigin: boolean;
  favoritesOnly: boolean;
  onFavoritesOnly: (v: boolean) => void;
  hasFavorites: boolean;
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  canExport: boolean;
  onExport: (format: ExportFormat) => Promise<void>;
}

const chip =
  'inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[11.5px] font-semibold transition-colors';

export function NotesToolbar(p: Props) {
  const { t } = useTranslation('notes');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const run = async (format: ExportFormat) => {
    setBusy(format);
    try {
      await p.onExport(format);
      setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  const items: { format: ExportFormat; icon: typeof FileText; label: string }[] = [
    { format: 'markdown', icon: FileText, label: t('exportMarkdown') },
    { format: 'csv', icon: Table, label: t('exportCSV') },
    { format: 'json', icon: FileJson, label: t('exportJSON') },
    { format: 'print', icon: Printer, label: t('exportPrint') },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[420px] flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-caption"
            aria-hidden="true"
          />
          <input
            type="text"
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-lg border border-border bg-card py-2 pe-9 ps-9 text-[13px] text-foreground outline-none transition-colors placeholder:text-caption focus:border-accent"
          />
          {p.query && (
            <button
              type="button"
              onClick={() => p.onQuery('')}
              aria-label={t('clearSearch')}
              className="absolute end-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-muted hover:bg-border"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>

        <select
          value={p.sort}
          onChange={(e) => p.onSort(e.target.value as SortOption)}
          aria-label={t('sortLabel')}
          className="cursor-pointer rounded-lg border border-border bg-card px-2.5 py-[7px] text-[12.5px] font-medium text-muted-foreground outline-none focus:border-accent"
        >
          <option value="newest">{t('sortNewest')}</option>
          <option value="oldest">{t('sortOldest')}</option>
          <option value="source">{t('sortSource')}</option>
        </select>

        <div className="flex-1" />

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="md" disabled={!p.canExport}>
              <Download />
              {t('exportButton')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1">
            {items.map(({ format, icon: Icon, label }) => (
              <button
                key={format}
                type="button"
                disabled={busy !== null}
                onClick={() => run(format)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-sm text-foreground hover:bg-muted disabled:opacity-60"
              >
                {busy === format ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" aria-hidden="true" />
                )}
                {label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {(p.showOrigin || p.hasFavorites) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {p.showOrigin &&
            (['all', 'device', 'account'] as OriginFilter[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => p.onOrigin(o)}
                aria-pressed={p.origin === o}
                className={cn(
                  chip,
                  p.origin === o
                    ? 'bg-primary-light text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-border',
                )}
              >
                {t(`where.${o}`)}
              </button>
            ))}
          {p.hasFavorites && (
            <button
              type="button"
              onClick={() => p.onFavoritesOnly(!p.favoritesOnly)}
              aria-pressed={p.favoritesOnly}
              className={cn(
                chip,
                p.favoritesOnly
                  ? 'bg-primary-light text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-border',
              )}
            >
              <Star className="h-3 w-3" aria-hidden="true" />
              {t('favoritesOnly')}
            </button>
          )}
        </div>
      )}

      {p.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="me-1 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3 w-3" aria-hidden="true" />
            {t('filterByTag')}
          </span>
          {p.tags.map((tag) => {
            const active = p.selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => p.onToggleTag(tag)}
                aria-pressed={active}
                className={cn(
                  chip,
                  active
                    ? 'bg-primary-light text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-border',
                )}
              >
                {active && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                {tag}
              </button>
            );
          })}
          {p.selectedTags.length > 0 && (
            <button
              type="button"
              onClick={p.onClearTags}
              className={cn(chip, 'text-accent hover:bg-accent/10')}
            >
              <X className="h-3 w-3" />
              {t('clearFilters')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
