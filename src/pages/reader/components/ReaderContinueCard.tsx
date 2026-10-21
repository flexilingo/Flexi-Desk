import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { languageName } from '../library/format';
import { useReaderErrorText } from '../lib/use-error-text';
import type { ReadingItem } from '../lib/queue';
import { actionLabel, progressLine } from '../lib/reading-copy';
import { ReaderThumb } from './ReaderThumb';
import { RowMenu, type MenuAction } from './RowMenu';

/**
 * The one thing this reader was in the middle of.
 *
 * Their most recent read is the first thing on the page and carries the page's
 * only filled button: returning is a glance and a click rather than a search.
 */
export function ReaderContinueCard({ item, menu }: { item: ReadingItem; menu: MenuAction[] }) {
  const { t, i18n } = useTranslation('reader');
  const { t: tl } = useTranslation('readingLibrary');
  const errorText = useReaderErrorText();

  const meta = [
    item.level,
    languageName(item.language, i18n.language),
    progressLine(item, t, tl),
  ].filter(Boolean);

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-nowrap sm:gap-5 sm:p-5">
      <Link to={item.href} className="w-16 shrink-0 sm:w-24" tabIndex={-1}>
        <ReaderThumb item={item} size="md" />
      </Link>

      <div className="min-w-0 flex-[1_1_10rem]">
        <p className="text-xs font-semibold text-muted-foreground">
          {item.started ? t('home.continueEyebrow') : t('home.startEyebrow')}
        </p>
        <h2 className="mt-1 line-clamp-2 text-lg font-extrabold leading-snug tracking-tight text-foreground sm:text-[22px]">
          <bdi>{item.title}</bdi>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{meta.join(' · ')}</p>

        {item.status === 'ready' && item.progress !== null && (
          <div className="mt-3 h-1.5 max-w-[320px] overflow-hidden rounded-full bg-muted">
            <div
              role="progressbar"
              aria-valuenow={item.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className={cn(
                'h-full rounded-full transition-[width] duration-300',
                item.finished ? 'bg-success' : 'bg-primary-dark',
              )}
              // A continuous value: no class can express a percentage.
              style={{ width: `${Math.max(item.progress, item.started ? 3 : 0)}%` }}
            />
          </div>
        )}
        {item.status === 'processing' && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary-dark">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('processing.extracting')}
          </p>
        )}
        {item.status === 'failed' && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-error">
            <TriangleAlert className="h-3.5 w-3.5" />
            {errorText(item.errorCode)}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button asChild>
          <Link to={item.href}>
            {item.finished ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            )}
            {actionLabel(item, t, tl)}
          </Link>
        </Button>
        <RowMenu items={menu} label={t('home.more')} />
      </div>
    </section>
  );
}
