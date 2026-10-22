import { useTranslation } from 'react-i18next';

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Previous / page n of m / next, used by every paged hub list. */
export function HubPager({ page, totalPages, onPageChange }: Props) {
  const { t } = useTranslation('common');
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
      >
        {t('podcast.previous')}
      </button>
      <span className="px-3 text-sm tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
      >
        {t('podcast.next')}
      </button>
    </div>
  );
}
