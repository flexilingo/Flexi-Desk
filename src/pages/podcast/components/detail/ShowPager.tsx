import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { pagerPages } from '../../utils/showEpisodes';

interface Props {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/** The website's pager: a count on one side, previous / numbered pages / next on the other. */
export function ShowPager({ currentPage, totalPages, totalCount, pageSize, onPageChange }: Props) {
  const { t, i18n } = useTranslation('podcastUi');
  if (totalPages <= 1) return null;
  const num = new Intl.NumberFormat(i18n.language);
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  const pageButtons = (mobile: boolean) =>
    pagerPages(currentPage, totalPages, mobile).map((page, i) =>
      page === '…' ? (
        <span
          key={`gap-${i}`}
          className="flex h-8 w-5 items-center justify-center text-[12px] text-caption"
        >
          …
        </span>
      ) : (
        <button
          key={page}
          type="button"
          onClick={() => onPageChange(page)}
          aria-current={page === currentPage ? 'page' : undefined}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg text-[13px] tabular-nums',
            page === currentPage
              ? 'bg-primary font-bold text-primary-foreground shadow-xs'
              : 'border border-border bg-card font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground',
          )}
        >
          {num.format(page)}
        </button>
      ),
    );

  return (
    <div className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-4 sm:flex-row">
      <p className="order-2 text-[12px] text-caption sm:order-1">
        {t('show.pagination.showing', {
          start: num.format(start),
          end: num.format(end),
          total: num.format(totalCount),
        })}
      </p>
      <div className="order-1 flex items-center gap-1 sm:order-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label={t('show.pagination.previous')}
        >
          <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          {t('show.pagination.previous')}
        </Button>
        <div className="mx-1 flex items-center gap-1">{pageButtons(false)}</div>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label={t('show.pagination.next')}
        >
          {t('show.pagination.next')}
          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
