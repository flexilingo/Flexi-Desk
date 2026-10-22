import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { VIDEO_PAGE_SIZE } from '../lib/videoFilters';

/** The page numbers shown: all of them when few, else the ends and the neighbours with gaps. */
export function pageWindow(current: number, total: number): (number | '…')[] {
  const max = 5;
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 2) return [1, 2, 3, 4, '…', total];
  if (current >= total - 1) return [1, '…', total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

/** The website's pager: "Showing x to y of n", Previous, page numbers, Next. Nothing when one page. */
export function Pager({
  page,
  pages,
  total,
  onPage,
  pageSize = VIDEO_PAGE_SIZE,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
  pageSize?: number;
}) {
  const { t } = useTranslation('videos');
  if (pages <= 1 || total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <nav
      className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row"
      aria-label={t('pagination.page', { page, total: pages })}
    >
      <p className="order-2 text-[12px] text-caption sm:order-1">
        {t('pagination.showing', { start, end, total })}
      </p>
      <div className="order-1 flex items-center gap-1 sm:order-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          {t('pagination.previous')}
        </Button>
        <div className="mx-1 flex items-center gap-1">
          {pageWindow(page, pages).map((p, i) =>
            p === '…' ? (
              <span
                key={`e${i}`}
                className="flex h-8 w-5 items-center justify-center text-[12px] text-caption"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPage(p)}
                className={
                  p === page
                    ? 'flex h-8 w-8 items-center justify-center rounded-lg bg-olive-600 text-[13px] font-bold text-white shadow-sm'
                    : 'flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-[13px] font-medium text-muted-foreground transition-colors hover:border-olive-500/40 hover:bg-muted hover:text-foreground'
                }
              >
                {p}
              </button>
            ),
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          {t('pagination.next')}
          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </Button>
      </div>
    </nav>
  );
}
