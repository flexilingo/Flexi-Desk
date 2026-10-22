import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CefrBand, VocabSort, VocabStatus } from './vocabLogic';

interface Props {
  status: 'all' | VocabStatus;
  onStatus: (v: 'all' | VocabStatus) => void;
  cefr: CefrBand;
  onCefr: (v: CefrBand) => void;
  sort: VocabSort;
  onSort: (v: VocabSort) => void;
  search: string;
  onSearch: (v: string) => void;
}

const chipBase =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-[1.5px] px-[11px] py-[5px] text-xs font-semibold transition-all';
const chipActive = 'border-accent/30 bg-accent/10 text-accent';
const chipIdle =
  'border-border bg-card text-muted-foreground hover:border-accent/30 hover:text-accent';

const BANDS: { value: CefrBand; label: string; dot: string }[] = [
  { value: 'A1', label: 'A1–A2', dot: 'bg-success/60' },
  { value: 'B1', label: 'B1–B2', dot: 'bg-primary-light/60' },
  { value: 'C1', label: 'C1–C2', dot: 'bg-accent/60' },
];

export function VocabFilters({
  status,
  onStatus,
  cefr,
  onCefr,
  sort,
  onSort,
  search,
  onSearch,
}: Props) {
  const { t } = useTranslation('vocabulary');
  const isAll = status === 'all' && cefr === 'all';
  const statuses: VocabStatus[] = ['new', 'learning', 'mastered'];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 max-w-xs flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 transition-colors focus-within:border-accent/40">
          <Search className="h-[15px] w-[15px] shrink-0 text-caption" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            dir="auto"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-caption"
          />
        </div>
        <div className="ms-auto">
          <Select value={sort} onValueChange={(v) => onSort(v as VocabSort)}>
            <SelectTrigger
              className="h-9 w-[160px] border-border bg-card text-xs text-muted-foreground"
              aria-label={t('sortLabel')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">{t('sortRecent')}</SelectItem>
              <SelectItem value="most_clicked">{t('sortClicked')}</SelectItem>
              <SelectItem value="alphabetical">{t('sortAlpha')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            onStatus('all');
            onCefr('all');
          }}
          aria-pressed={isAll}
          className={cn(chipBase, isAll ? chipActive : chipIdle)}
        >
          {t('statusAll')}
        </button>
        {BANDS.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => onCefr(cefr === b.value ? 'all' : b.value)}
            aria-pressed={cefr === b.value}
            className={cn(chipBase, cefr === b.value ? chipActive : chipIdle)}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', b.dot)} />
            {b.label}
          </button>
        ))}
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onStatus(status === s ? 'all' : s)}
            aria-pressed={status === s}
            className={cn(chipBase, status === s ? chipActive : chipIdle)}
          >
            {t(`status.${s}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
