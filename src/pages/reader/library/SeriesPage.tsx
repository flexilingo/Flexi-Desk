import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, BookOpen, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CefrBadge } from '@/components/common/CefrBadge';
import { getLibrarySeries, type LibrarySeriesPage } from '../services/libraryService';
import { useReaderErrorText } from '../lib/use-error-text';
import { ReaderShell } from '../components/ReaderShell';
import { BookCover } from './BookCover';
import { bookReadPath, languageName, readingMinutes } from './format';
import { LEVEL_ORDER } from './library-filter';

/** "A2" or "A2–B1": the span of levels the episodes cover. */
function levelSpan(levels: string[]): string {
  const known = LEVEL_ORDER.filter((l) => levels.includes(l));
  if (known.length === 0) return '';
  return known.length > 1 ? `${known[0]}–${known[known.length - 1]}` : known[0];
}

/**
 * One series, like the website's series page (and its podcast show page): the cover and
 * title, then every season with its episodes. Season 1 is open; later seasons note that
 * page 1 of each episode is free and the rest needs a free account.
 */
export function SeriesPage() {
  const { language = '', slug = '' } = useParams<{ language: string; slug: string }>();
  const { t, i18n } = useTranslation('readingLibrary');
  const errorText = useReaderErrorText();
  const [data, setData] = useState<LibrarySeriesPage | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    getLibrarySeries(language, slug)
      .then((d) => !cancelled && setData(d))
      .catch((cause) => !cancelled && setError(cause ?? 'SERIES_NOT_FOUND'));
    return () => {
      cancelled = true;
    };
  }, [language, slug]);

  const back = (
    <Link
      to={`/reader/library?lang=${language}`}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
      {t('public.listHeading', { language: languageName(language, i18n.language) })}
    </Link>
  );

  if (error) {
    return (
      <ReaderShell>
        {back}
        <p
          role="alert"
          className="mt-6 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
        >
          {errorText(error)}
        </p>
      </ReaderShell>
    );
  }
  if (!data) {
    return (
      <ReaderShell>
        {back}
        <div data-testid="series-loading" className="mt-6 h-64 animate-pulse rounded-xl bg-card" />
      </ReaderShell>
    );
  }

  const { series, seasons } = data;
  const episodes = seasons.flatMap((s) => s.episodes);
  const first = episodes[0];
  const showSeasons = seasons.length > 1 || (seasons[0]?.number ?? 1) > 1;

  return (
    <ReaderShell>
      {back}
      <header className="mt-6 flex items-start gap-5 sm:gap-7">
        <div className="w-28 shrink-0 sm:w-40">
          <BookCover
            slug={series.slug}
            title={series.title}
            level={first?.level ?? 'B1'}
            series={null}
            coverPath={series.cover_path}
            alt={t('public.coverAlt', { title: series.title })}
            showLevel={false}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('series.kicker', { language: languageName(series.language, i18n.language) })}
          </p>
          <h1
            className="mt-2 text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl"
            lang={series.language}
            dir="auto"
          >
            {series.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {levelSpan(episodes.map((e) => e.level))} ·{' '}
            {t('series.episodes', { count: series.episode_count })}
            {showSeasons ? <> · {t('series.seasons', { count: seasons.length })}</> : null}
          </p>
          {first && (
            <Button asChild variant="accent" className="mt-4">
              <Link to={bookReadPath(first.id)}>
                <BookOpen className="h-4 w-4" />
                {t('series.start')}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
          )}
        </div>
      </header>

      {series.summary && (
        <p
          className="mt-6 text-base leading-relaxed text-muted-foreground"
          lang={series.language}
          dir="auto"
        >
          {series.summary}
        </p>
      )}

      {showSeasons && (
        <nav className="mt-6 flex flex-wrap gap-2" aria-label={t('series.seasonNav')}>
          {seasons.map((s) => (
            <a
              key={s.number}
              href={`#season-${s.number}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(`season-${s.number}`)
                  ?.scrollIntoView?.({ behavior: 'smooth' });
              }}
              className="inline-flex items-center rounded-full border border-primary/30 bg-card px-3 py-1 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              {t('series.season', { n: s.number })}
            </a>
          ))}
        </nav>
      )}

      {seasons.map((season) => (
        <section key={season.number} id={`season-${season.number}`} className="mt-10 scroll-mt-4">
          {showSeasons && (
            <div className="mb-3">
              <h2 className="text-lg font-bold text-foreground" lang={series.language} dir="auto">
                {season.title ?? t('series.season', { n: season.number })}
              </h2>
              {season.summary && (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground" dir="auto">
                  {season.summary}
                </p>
              )}
              {season.requires_login && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Lock className="h-3.5 w-3.5" />
                  {t('series.loginNote')}
                </p>
              )}
            </div>
          )}
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {season.episodes.map((e) => (
              <li key={e.id}>
                <Link
                  to={bookReadPath(e.id)}
                  className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted"
                >
                  <span className="w-6 shrink-0 pt-0.5 text-sm text-muted-foreground">
                    {e.series_episode ?? e.series_order}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-sm font-bold text-foreground group-hover:text-primary"
                      lang={series.language}
                      dir="auto"
                    >
                      {e.title}
                    </span>
                    {e.summary && (
                      <span
                        className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground"
                        dir="auto"
                      >
                        {e.summary}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <CefrBadge level={e.level} />
                    <span className="text-xs text-muted-foreground">
                      {t('catalog.minutes', { n: readingMinutes(e.word_count) })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </ReaderShell>
  );
}
