import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Previous / next with "Page X of Y"; nothing when everything fits on one page. */
export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const { t } = useTranslation('videos');
  if (pages <= 1 || total === 0) return null;
  return (
    <nav
      className="mt-6 flex items-center justify-center gap-3"
      aria-label={t('pagination.page', { page, total: pages })}
    >
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        {t('pagination.previous')}
      </Button>
      <span className="text-sm tabular-nums text-muted-foreground">
        {t('pagination.page', { page, total: pages })}
      </span>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('pagination.next')}
        <ChevronRight className="h-4 w-4 rtl:rotate-180" />
      </Button>
    </nav>
  );
}
