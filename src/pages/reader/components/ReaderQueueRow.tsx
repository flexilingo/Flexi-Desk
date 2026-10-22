import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { languageName } from '../library/format';
import { useReaderErrorText } from '../lib/use-error-text';
import type { ReadingItem } from '../lib/queue';
import { actionLabel, progressLine } from '../lib/reading-copy';
import { ReaderThumb } from './ReaderThumb';
import { RowMenu, type MenuAction } from './RowMenu';

/**
 * One row of the reading list.
 *
 * Exactly one visible action, always, and it is a quiet link: the filled button
 * belongs to the continue card above.
 */
export function ReaderQueueRow({ item, menu }: { item: ReadingItem; menu: MenuAction[] }) {
  const { t, i18n } = useTranslation('reader');
  const { t: tl } = useTranslation('readingLibrary');
  const { t: tDesk } = useTranslation('readerDesk');
  const errorText = useReaderErrorText();

  const where = progressLine(item, t, tl);

  return (
    <li className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/60 sm:gap-4 sm:px-4">
      <Link to={item.href} className="w-10 shrink-0" tabIndex={-1}>
        <ReaderThumb item={item} size="xs" />
      </Link>

      <div className="min-w-0 flex-1">
        <Link to={item.href} className="block">
          <p className="truncate text-[15px] font-bold leading-snug text-foreground">
            <bdi>{item.title}</bdi>
          </p>
        </Link>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {item.level && <span>{item.level}</span>}
          {item.level && <span aria-hidden>·</span>}
          <span>
            {item.kind === 'book'
              ? languageName(item.language, i18n.language)
              : item.kind === 'text'
                ? tDesk('home.kindText')
                : t(`home.kind.${item.kind}`)}
          </span>
          {item.status === 'ready' && where && (
            <>
              <span aria-hidden>·</span>
              {item.finished ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-3 w-3" />
                  {where}
                </span>
              ) : (
                <span className="tabular-nums">{where}</span>
              )}
            </>
          )}
          {item.status === 'processing' && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 text-primary-dark">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('processing.extracting')}
              </span>
            </>
          )}
          {item.status === 'failed' && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 text-error">
                <TriangleAlert className="h-3 w-3" />
                {errorText(item.errorCode)}
              </span>
            </>
          )}
        </p>
      </div>

      {item.status === 'ready' && item.started && !item.finished && item.progress !== null && (
        <div className="hidden h-1 w-28 shrink-0 overflow-hidden rounded-full bg-muted md:block">
          <div
            className="h-full rounded-full bg-primary-dark"
            // A continuous value: no class can express a percentage.
            style={{ width: `${Math.max(item.progress, 3)}%` }}
          />
        </div>
      )}

      <Link
        to={item.href}
        className="hidden shrink-0 text-sm font-semibold text-primary hover:underline sm:inline"
      >
        {actionLabel(item, t, tl)}
      </Link>
      <RowMenu items={menu} label={t('home.more')} />
    </li>
  );
}
