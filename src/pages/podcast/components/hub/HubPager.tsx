import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { pagerPages } from '../../utils/showEpisodes';

interface Props {
  page: number;
  totalPages: number;
  /** Total rows; with `pageSize` it prints the "Showing a-b of n" line. */
  totalCount?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

/** The website's pagination: count on one side, previous / numbered pages / next on the other. */
export function HubPager({ page, totalPages, totalCount, pageSize, onPageChange }: Props) {
  const { t } = useTranslation('podcastUi');
  if (totalPages <= 1) return null;

  const hasCount = totalCount != null && pageSize != null;
  const start = hasCount ? (page - 1) * pageSize + 1 : 0;
  const end = hasCount ? Math.min(page * pageSize, totalCount) : 0;

  const pageBtn = (p: number) =>
    cn(
      'flex h-8 w-8 items-center justify-center rounded-lg text-[13px]',
      p === page
        ? 'bg-primary-light font-bold text-white shadow-sm'
        : 'border border-border bg-card font-medium text-muted-foreground transition-colors hover:border-primary-light/40 hover:bg-muted hover:text-foreground',
    );

  const render = (mobile: boolean) =>
    pagerPages(page, totalPages, mobile).map((p, i) =>
      p === '…' ? (
        <span
          key={`e${i}`}
          className="flex h-8 w-5 items-center justify-center text-[12px] text-caption"
        >
          …
        </span>
      ) : (
        <button key={p} type="button" onClick={() => onPageChange(p)} className={pageBtn(p)}>
          {p}
        </button>
      ),
    );

  return (
    <div className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row">
      {hasCount ? (
        <p className="order-2 text-[12px] text-caption sm:order-1">
          <span className="hidden sm:inline">
            {t('paginationShowing', { start, end, total: totalCount })}
          </span>
          <span className="sm:hidden">
            {start}–{end} <span className="text-caption/60">/</span> {totalCount}
          </span>
        </p>
      ) : (
        <span className="order-2 sm:order-1" />
      )}

      <div className="order-1 flex items-center gap-1 sm:order-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label={t('paginationPrevious')}
        >
          <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          <span className="hidden sm:inline">{t('paginationPrevious')}</span>
        </Button>
        <div className="mx-1 hidden items-center gap-1 sm:flex">{render(false)}</div>
        <div className="mx-1 flex items-center gap-1 sm:hidden">{render(true)}</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label={t('paginationNext')}
        >
          <span className="hidden sm:inline">{t('paginationNext')}</span>
          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
