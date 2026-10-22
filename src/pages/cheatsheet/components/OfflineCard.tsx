import { useEffect } from 'react';
import { CloudDownload, Trash2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { useOfflineStore } from '../lib/offlineStore';
import { formatCount } from '../lib/types';
import { CARD } from '../ui';
import { useCsLocale, useOnline } from './shared';

const formatSize = (bytes: number, locale: string) =>
  `${(bytes / (1024 * 1024)).toLocaleString(locale === 'fa' ? 'fa-IR' : locale, { maximumFractionDigits: 1 })} MB`;

/**
 * "Download for offline": the whole index and every topic of the language, plus the
 * verb lists, with a progress bar. What is already stored is shown, and can be
 * removed. Verb pages are saved the first time each is opened.
 */
export default function OfflineCard({ lang, locale }: { lang: string; locale: string }) {
  const { t } = useCsLocale();
  const online = useOnline();
  const { running, progress, stats, error, start, cancel, clear, refreshStats } = useOfflineStore();

  useEffect(() => void refreshStats(lang), [lang, refreshStats]);

  const fmt = (n: number) => formatCount(n, locale);
  const hasCopy = !!stats && stats.topics > 0;
  const ratio = progress && progress.total ? Math.min(1, progress.done / progress.total) : 0;
  const failed = !running && progress?.phase === 'done' && progress.failed > 0;

  const phaseText = progress
    ? progress.phase === 'index'
      ? t('offline.phaseIndex')
      : progress.phase === 'topics'
        ? t('offline.phaseTopics', { done: fmt(progress.done), total: fmt(progress.total) })
        : t('offline.phaseVerbs', { done: fmt(progress.done), total: fmt(progress.total) })
    : t('offline.phaseIndex');

  return (
    <section className={`${CARD} px-4 py-4 sm:px-6 sm:py-5`}>
      <div className="flex gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-primary/10 text-primary">
          <CloudDownload className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground">{t('offline.title')}</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            {t('offline.subtitle')}
          </p>
          <p className="mt-2 text-sm text-caption">
            {hasCopy
              ? t('offline.stored', {
                  topics: fmt(stats.topics),
                  verbs: fmt(stats.verbs),
                  size: formatSize(stats.bytes, locale),
                })
              : t('offline.storedNone')}
          </p>

          {running && (
            <div className="mt-3" role="status">
              <progress
                value={Math.round(ratio * 100)}
                max={100}
                aria-label={phaseText}
                className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-accent"
              />
              <p className="mt-1.5 text-sm text-muted-foreground">{phaseText}</p>
            </div>
          )}

          {!running && progress?.phase === 'done' && !failed && (
            <p className="mt-3 text-sm font-semibold text-success">
              {t('offline.done', { topics: fmt(stats?.topics ?? progress.total) })}
            </p>
          )}
          {failed && (
            <InlineError
              className="mt-3"
              message={t('offline.doneFailed', { count: fmt(progress.failed) })}
            />
          )}
          {error && <InlineError className="mt-3" message={t('errors.loadFailed')} />}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {running ? (
              <Button variant="outline" onClick={cancel}>
                {t('offline.cancel')}
              </Button>
            ) : (
              <Button variant="accent" disabled={!online} onClick={() => void start(lang, locale)}>
                {online ? <CloudDownload /> : <WifiOff />}
                {hasCopy ? t('offline.update') : t('offline.action')}
              </Button>
            )}
            {hasCopy && !running && (
              <Button variant="ghost" onClick={() => void clear(lang)}>
                <Trash2 />
                {t('offline.clear')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
