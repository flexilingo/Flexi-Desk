import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { browseEpisodes, getCuratedList, getPopularEpisodes } from '../../services/podcastCloud';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import { CardSkeletonGrid, EpisodeCardGrid } from './EpisodeCardGrid';
import { curatedToEpisodeByLevel } from '../../utils/episodeCards';
import { PodcastTileGrid } from './PodcastTileCard';
import { HubPager } from './HubPager';
import { EPISODE_VIEWS, HUB_PAGE_SIZE, type HubView } from '../../utils/hubParams';
import type { CefrLevel, CuratedEpisodeLite, CuratedPodcast, TopicCategory } from '../../types';

interface Props {
  view: HubView;
  cefr?: CefrLevel;
  topic?: TopicCategory;
  language?: string;
  /** Episode-length ceiling in minutes (episode views only). */
  duration?: number;
  page: number;
  onPageChange: (page: number) => void;
  /** The view's total, for the line under the filter bar; undefined for the popular ranking (no total). */
  onTotalChange?: (total: number | undefined) => void;
  /** Print the total above the list; off once a filter is on, when the bar's line carries it. */
  showTotal?: boolean;
}

type PopularRow = CuratedEpisodeLite & { backfilled?: boolean | null };

/**
 * One of the website's five hub views, narrowed by the filter bar. Level, topic, language and length
 * feed the view's own request, so the two axes compose: picking French does not leave "Just analyzed".
 */
export function HubViewList({
  view,
  cefr,
  topic,
  language,
  duration,
  page,
  onPageChange,
  onTotalChange,
  showTotal = true,
}: Props) {
  const { t: tp } = useTranslation('podcastUi');
  const navigate = useNavigate();
  const { playCuratedEpisode, error: importError } = useImportAndPlay();

  const [episodes, setEpisodes] = useState<CuratedEpisodeLite[]>([]);
  const [podcasts, setPodcasts] = useState<CuratedPodcast[]>([]);
  const [rankedCount, setRankedCount] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const episodeView = EPISODE_VIEWS.includes(view);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    onTotalChange?.(undefined);
    const run = async () => {
      if (view === 'popular') {
        const res = await getPopularEpisodes(12, 30, {
          difficulty: cefr,
          language,
          topic,
          maxDuration: duration,
        });
        return {
          episodes: res.episodes ?? [],
          podcasts: [] as CuratedPodcast[],
          total: undefined as number | undefined,
          ranked: (res as { ranked_count?: number }).ranked_count ?? null,
        };
      }
      if (view === 'analyzed' || view === 'latest') {
        const res = await browseEpisodes({
          sort: view === 'analyzed' ? 'recent' : 'newest',
          difficulty: cefr,
          language,
          topic,
          maxDuration: duration,
          page,
          limit: HUB_PAGE_SIZE,
        });
        return { episodes: res.episodes ?? [], podcasts: [], total: res.total ?? 0, ranked: null };
      }
      const res = await getCuratedList({
        cefr,
        topic,
        language,
        sort: view === 'podcasts' ? 'analyses' : 'newest',
        ...(view === 'newPodcasts' ? { has_transcriptions: 'true' as const } : {}),
        page,
        limit: HUB_PAGE_SIZE,
      });
      return { episodes: [], podcasts: res.podcasts ?? [], total: res.total ?? 0, ranked: null };
    };
    run()
      .then((r) => {
        if (id !== requestId.current) return;
        setEpisodes(r.episodes);
        setPodcasts(r.podcasts);
        setRankedCount(r.ranked);
        setTotal(r.total ?? 0);
        onTotalChange?.(r.total);
        setLoading(false);
      })
      .catch((e) => {
        if (id !== requestId.current) return;
        setEpisodes([]);
        setPodcasts([]);
        setError(String(e));
        onTotalChange?.(undefined);
        setLoading(false);
      });
  }, [view, cefr, topic, language, duration, page, onTotalChange]);

  // A request that lands after the list changed must not write; leaving clears the count.
  useEffect(() => () => onTotalChange?.(undefined), [onTotalChange]);

  const byId = useMemo(() => new Map(episodes.map((e) => [e.id, e])), [episodes]);
  const play = (card: { id: string }) => {
    const row = byId.get(card.id);
    if (row) return playCuratedEpisode(row);
  };
  const openShow = (feedId: number) => navigate(`/podcast/show/${feedId}`);

  // The popular ranking is topped up with newest-analyzed rows; those are split out below a divider.
  const { ranked, backfilled } = useMemo(() => {
    if (view !== 'popular') return { ranked: episodes, backfilled: [] as CuratedEpisodeLite[] };
    const rows = episodes as PopularRow[];
    const rc = rankedCount ?? rows.length;
    return {
      ranked: rows.filter((e, i) => (e.backfilled == null ? i < rc : !e.backfilled)),
      backfilled: rows.filter((e, i) => (e.backfilled == null ? i >= rc : e.backfilled)),
    };
  }, [view, episodes, rankedCount]);

  if (loading) {
    return <CardSkeletonGrid count={episodeView && view === 'popular' ? 12 : HUB_PAGE_SIZE} />;
  }

  if (error) {
    return (
      <p role="alert" className="py-6 text-center text-sm text-error">
        {error}
      </p>
    );
  }

  const nothing = episodeView ? episodes.length === 0 : podcasts.length === 0;
  if (nothing) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{tp('noEpisodesYet')}</p>;
  }

  const totalPages = Math.max(1, Math.ceil(total / HUB_PAGE_SIZE));
  const totalLine =
    showTotal && total > 0 && view !== 'popular' ? (
      <div className="flex items-baseline gap-2 border-b border-border pb-2.5">
        <span
          className={`text-[22px] font-extrabold leading-none tracking-tight tabular-nums ${
            episodeView ? 'text-foreground' : 'text-warning'
          }`}
        >
          {total.toLocaleString()}
        </span>
        <span className="text-[12.5px] font-medium text-muted-foreground">
          {episodeView
            ? total === 1
              ? tp('episodeSingular')
              : tp('episodePlural')
            : total === 1
              ? tp('podcastSingular')
              : tp('podcastPlural')}
        </span>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {importError && (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error"
        >
          {importError}
        </p>
      )}
      {totalLine}
      {episodeView ? (
        <>
          <EpisodeCardGrid
            episodes={ranked.map(curatedToEpisodeByLevel)}
            onPlay={play}
            onOpenPodcast={openShow}
          />
          {backfilled.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-1">
                <span className="whitespace-nowrap text-[12.5px] font-semibold text-muted-foreground">
                  {tp('moreToExplore')}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <EpisodeCardGrid
                episodes={backfilled.map(curatedToEpisodeByLevel)}
                onPlay={play}
                onOpenPodcast={openShow}
              />
            </>
          )}
        </>
      ) : (
        <PodcastTileGrid podcasts={podcasts} onOpen={openShow} />
      )}
      {view !== 'popular' && (
        <HubPager
          page={page}
          totalPages={totalPages}
          totalCount={total}
          pageSize={HUB_PAGE_SIZE}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
