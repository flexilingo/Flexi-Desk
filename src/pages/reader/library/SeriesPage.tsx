import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowRight, BookOpen, Globe, Layers, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import {
  getLibraryShelf,
  getLibrarySeries,
  type LibrarySeason,
  type LibrarySeriesPage,
} from '../services/libraryService';
import {
  continueTarget,
  EMPTY_PROGRESS,
  progressFromShelf,
  type SeriesProgress,
} from './series-progress';
import { joinList, openingSeason, seasonName, seriesFit } from './series-fit';
import { useReaderErrorText } from '../lib/use-error-text';
import { BookCover, LevelBadge } from './BookCover';
import { ClampedSummary } from './ClampedSummary';
import { EPISODE_GRID, EpisodeCard, ReadMark } from './LibraryCards';
import { LibraryFitCard } from './LibraryFitCard';
import { SeasonTabs } from './SeasonTabs';
import { bookReadPath, coverFor, languageName, readingMinutes } from './format';

/** The bold part of a fit line (the translations' `<b>`). */
const bold = <b className="font-semibold text-foreground" />;

/**
 * One series, as the website's redesign lays it out (built like a podcast show page): the
 * series in a band at the top — a large cover beside the facts, the one call to action
 * (start, or continue where the reader left off) and whether it suits the reader — then
 * the episodes as cards, one season at a time. Seasons that need an account after page 1
 * say so before the click.
 */
export function SeriesPage() {
  const { language = '', slug = '' } = useParams<{ language: string; slug: string }>();
  const { t, i18n } = useTranslation('readingLibrary');
  const { t: tDesk } = useTranslation('readerDesk');
  const errorText = useReaderErrorText();
  const [data, setData] = useState<LibrarySeriesPage | null>(null);
  const [error, setError] = useState<unknown>(null);
  // The season tab the reader picked; until then the continue episode's season is open.
  const [picked, setPicked] = useState<number | null>(null);
  // Where the reader is in this series (signed in: the shelf). Only guides, never locks.
  const signedIn = !!useAuthStore((s) => s.session);
  const [progress, setProgress] = useState<SeriesProgress>(EMPTY_PROGRESS);

  useEffect(() => {
    if (!signedIn) {
      setProgress(EMPTY_PROGRESS);
      return;
    }
    let cancelled = false;
    getLibraryShelf()
      .then((r) => !cancelled && setProgress(progressFromShelf(r.items, language, slug)))
      // No shelf, no progress: the page still lists every episode.
      .catch(() => !cancelled && setProgress(EMPTY_PROGRESS));
    return () => {
      cancelled = true;
    };
  }, [signedIn, language, slug]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setPicked(null);
    getLibrarySeries(language, slug)
      .then((d) => !cancelled && setData(d))
      .catch((cause) => !cancelled && setError(cause ?? 'SERIES_NOT_FOUND'));
    return () => {
      cancelled = true;
    };
  }, [language, slug]);

  const crumbs = (title?: string) => (
    <nav
      aria-label={t('public.breadcrumb')}
      className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
    >
      <Link to={`/reader/library?lang=${language}`} className="hover:text-primary">
        {t('book.backToLibrary')}
      </Link>
      <span aria-hidden>/</span>
      <span>{languageName(language, i18n.language)}</span>
      {title && (
        <>
          <span aria-hidden>/</span>
          <span aria-current="page" className="line-clamp-1 text-foreground">
            <bdi lang={language}>{title}</bdi>
          </span>
        </>
      )}
    </nav>
  );

  if (error) {
    return (
      <div>
        {crumbs()}
        <p
          role="alert"
          className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
        >
          {errorText(error)}
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        {crumbs()}
        <div data-testid="series-loading" className="h-64 animate-pulse rounded-[9px] bg-card" />
      </div>
    );
  }

  const { series, seasons } = data;
  const episodes = seasons.flatMap((s) => s.episodes);
  const first = episodes[0];
  const showSeasons = seasons.length > 1 || (seasons[0]?.number ?? 1) > 1;
  const resume = continueTarget(episodes, progress);
  const labelOf = (e: (typeof episodes)[number]) =>
    showSeasons
      ? t('series.seasonEpisode', {
          season: e.series_season,
          n: e.series_episode ?? e.series_order,
        })
      : t('catalog.episode', { n: e.series_order });
  const num = new Intl.NumberFormat(i18n.language);
  const coverOf = (e: { slug: string; cover_path: string | null }) =>
    coverFor({ language: series.language, slug: e.slug, cover_path: e.cover_path });
  // The band shows the series' own cover, else its first episode's.
  const heroCover = series.cover_path ?? (first ? coverOf(first) : null);
  const fit = seriesFit(seasons);
  const active = picked ?? openingSeason(seasons, progress) ?? 1;
  const activeSeason = seasons.find((s) => s.number === active) ?? seasons[0];

  // "Is this series right for you?": the level split, the length, what is free.
  const points: ReactNode[] = [];
  if (fit.top) {
    points.push(
      <Trans
        t={t}
        i18nKey="series.fitMostly"
        values={{ percent: num.format(fit.top.percent), level: fit.top.level }}
        components={{ b: bold }}
      />,
    );
  }
  if (fit.avgMinutes) {
    points.push(
      <Trans
        t={t}
        i18nKey="series.fitMinutes"
        values={{ minutes: num.format(fit.avgMinutes) }}
        components={{ b: bold }}
      />,
    );
  }
  if (!fit.anyLogin) {
    points.push(<Trans t={t} i18nKey="series.fitAllFree" components={{ b: bold }} />);
  } else if (fit.freeSeasons.length) {
    const list = fit.freeSeasons.map((n) => num.format(n));
    points.push(
      <Trans
        t={t}
        i18nKey="series.fitAccess"
        count={list.length}
        values={{ list: joinList(list, i18n.language) }}
        components={{ b: bold }}
      />,
    );
  } else {
    points.push(t('series.loginNote'));
  }

  const fitCard = (compact: boolean) => (
    <LibraryFitCard
      title={t('series.fitTitle')}
      level={fit.top?.level ?? null}
      levelName={fit.top ? tDesk(`library.levelName.${fit.top.level}`) : undefined}
      levelHint={fit.top && !compact ? t(`public.levelHint.${fit.top.level}`) : undefined}
      shares={fit.shares}
      points={points}
      compact={compact}
    />
  );

  // One season: what it is about and whether it needs an account, then its episodes.
  const seasonPanel = (season: LibrarySeason) => (
    <>
      {(season.summary || season.requires_login) && (
        <div className="mb-5 max-w-3xl">
          {season.summary && (
            <p
              className="text-[14px] leading-relaxed text-muted-foreground"
              lang={series.language}
              dir="auto"
            >
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
      <ul className={EPISODE_GRID}>
        {season.episodes.map((e) => {
          const n = e.series_episode ?? e.series_order ?? 1;
          return (
            <EpisodeCard
              key={e.id}
              to={bookReadPath(e.id)}
              slug={e.slug}
              title={e.title}
              level={e.level}
              language={series.language}
              coverPath={coverOf(e)}
              number={num.format(n)}
              episodeLabel={t('catalog.episode', { n })}
              minutes={t('catalog.minutes', { n: readingMinutes(e.word_count) })}
              mark={
                e.series_order && progress.finished.has(e.series_order) ? (
                  <ReadMark label={t('series.readMark')} />
                ) : undefined
              }
            />
          );
        })}
      </ul>
    </>
  );

  return (
    <div className="@container">
      {/* The band: a large cover beside the facts and the one action, the fit card at the far side. */}
      <section className="rounded-[9px] border border-border bg-muted/50">
        <div className="px-6 pb-7 pt-5">
          {crumbs(series.title)}
          <div className="grid items-start gap-6 @5xl:grid-cols-[minmax(0,1fr)_340px] @5xl:gap-10">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-6">
              <div className="row-span-3 w-32 shrink-0 @3xl:w-[180px]">
                <BookCover
                  slug={series.slug}
                  title={series.title}
                  level={fit.lowest ?? 'B1'}
                  series={null}
                  coverPath={heroCover}
                  alt={t('public.coverAlt', { title: series.title })}
                  showLevel={false}
                />
              </div>

              <div className="min-w-0 pt-1">
                <p className="text-[13px] font-semibold text-primary">
                  {t('series.kicker', { language: languageName(series.language, i18n.language) })}
                </p>
                <h1 className="mt-0.5 text-[26px] font-bold leading-[1.15] tracking-[-0.015em] text-foreground @3xl:text-[34px]">
                  <bdi lang={series.language} dir="auto">
                    {series.title}
                  </bdi>
                </h1>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13.5px] text-muted-foreground">
                  {fit.lowest && fit.highest && (
                    <span className="inline-flex items-center gap-1.5">
                      <LevelBadge level={fit.lowest} />
                      {fit.lowest === fit.highest ? (
                        tDesk(`library.levelName.${fit.lowest}`)
                      ) : (
                        <>
                          <span aria-hidden>–</span>
                          <LevelBadge level={fit.highest} />
                        </>
                      )}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5 text-caption" />
                    {languageName(series.language, i18n.language)}
                  </span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <BookOpen className="h-3.5 w-3.5 text-caption" />
                    {t('series.episodes', { count: series.episode_count })}
                  </span>
                  {showSeasons && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Layers className="h-3.5 w-3.5 text-caption" />
                      {t('series.seasons', { count: seasons.length })}
                    </span>
                  )}
                </div>
              </div>

              {series.summary && (
                <ClampedSummary
                  text={series.summary}
                  lang={series.language}
                  lines={3}
                  className="col-start-2 mt-3 max-w-[820px]"
                />
              )}

              {first && (
                <div className="col-start-2 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  {resume ? (
                    <>
                      <Button asChild variant="accent">
                        <Link to={bookReadPath(resume.id)}>
                          <BookOpen className="h-4 w-4" />
                          {t('series.continue', { label: labelOf(resume) })}
                          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                        </Link>
                      </Button>
                      <Link
                        to={bookReadPath(first.id)}
                        className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {t('series.startOver')}
                      </Link>
                    </>
                  ) : (
                    <Button asChild variant="accent">
                      <Link to={bookReadPath(first.id)}>
                        <BookOpen className="h-4 w-4" />
                        {t('series.start')}
                        <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="hidden @5xl:block">{fitCard(true)}</div>
          </div>
        </div>
      </section>

      {/* Episodes: one season at a time. */}
      <div className="pb-8 pt-8">
        <h2 className="mb-4 text-[20px] font-bold tracking-[-0.01em] text-foreground">
          {t('series.episodeNav')}
          <span className="ms-1.5 text-[14px] font-normal tabular-nums text-caption">
            ({num.format(episodes.length)})
          </span>
        </h2>

        {showSeasons && activeSeason ? (
          <SeasonTabs
            tabs={seasons.map((s) => ({
              number: s.number,
              label: t('series.season', { n: s.number }),
              title: seasonName(s.title),
            }))}
            active={activeSeason.number}
            onPick={setPicked}
            lang={series.language}
            ariaLabel={t('series.seasonNav')}
          >
            {seasonPanel(activeSeason)}
          </SeasonTabs>
        ) : (
          seasons.map((season) => <div key={season.number}>{seasonPanel(season)}</div>)
        )}

        <div className="mt-10 @5xl:hidden">{fitCard(false)}</div>
      </div>
    </div>
  );
}
