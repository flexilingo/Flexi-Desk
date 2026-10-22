import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Previous / where you are / Next, at the foot of the page — where the eye is when the page
 * is done. Only the turn: jumping to a page number lives in the toolbar.
 *
 * `end` takes Next's place on the last page — the next episode, or the way back — rather
 * than leaving a dead Next button under the last line.
 */
export function ReaderPager({
  page,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  disabled = false,
  end,
}: {
  page: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  end?: ReactNode;
}) {
  const { t } = useTranslation('reader');

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
      <Button variant="outline" onClick={onPrev} disabled={!hasPrev || disabled}>
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        {t('read.prev')}
      </Button>

      <span className="text-xs tabular-nums text-muted-foreground">
        {t('read.pageOf', { n: page, total })}
      </span>

      {!hasNext && end ? (
        end
      ) : (
        <Button variant="outline" onClick={onNext} disabled={!hasNext || disabled}>
          {t('read.next')}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      )}
    </div>
  );
}
