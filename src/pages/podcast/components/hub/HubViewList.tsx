import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { browseEpisodes, getCuratedList, getPopularEpisodes } from '../../services/podcastCloud';
import { useDiscoverStore } from '../../stores/discoverStore';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import { PodcastCardCompact } from '../discover/PodcastCardCompact';
import { EpisodeRow } from './EpisodeRow';
import { HubPager } from './HubPager';
import { EPISODE_VIEWS, HUB_PAGE_SIZE, type HubView } from '../../utils/hubParams';
import type { CefrLevel, CuratedEpisodeLite, CuratedPodcast, TopicCategory } from '../../types';

interface Props {
  view: Exclude<HubView, 'overview'>;
  cefr?: CefrLevel;
  topic?: TopicCategory;
  language?: string;
  /** Episode-length ceiling in minutes (episode views only). */
  duration?: number;
  page: number;
  onPageChange: (page: number) => void;
  /** The view's total, for the line under the filter bar; undefined for the popular ranking (no total). */
  onTotalChange?: (total: number | undefined) => void;
}

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
}: Props) {
  const { t: tp } = useTranslation('podcastUi');
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const { followedFeedIds, followingFeedId, followPodcast } = useDiscoverStore();
  const { playCuratedEpisode, importingId, error: importError } = useImportAndPlay();

  const [episodes, setEpisodes] = useState<CuratedEpisodeLite[]>([]);
  const [podcasts, setPodcasts] = useState<CuratedPodcast[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const episodeView = EPISODE_VIEWS.includes(view);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
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
          podcasts: [],
          total: undefined as number | undefined,
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
        return { episodes: res.episodes ?? [], podcasts: [], total: res.total ?? 0 };
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
      return { episodes: [], podcasts: res.podcasts ?? [], total: res.total ?? 0 };
    };
    run()
      .then((r) => {
        if (id !== requestId.current) return;
        setEpisodes(r.episodes);
        setPodcasts(r.podcasts);
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

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const nothing = episodeView ? episodes.length === 0 : podcasts.length === 0;
  if (error || nothing) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-12 text-center">
        <Headphones className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className={error ? 'text-sm text-error' : 'text-sm text-muted-foreground'}>
          {error ?? tp('noResults')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {importError && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
          {importError}
        </div>
      )}
      {episodeView ? (
        <div className="space-y-2">
          {episodes.map((ep, i) => (
            <EpisodeRow
              key={ep.id}
              episode={ep}
              index={(page - 1) * HUB_PAGE_SIZE + i + 1}
              showRank={view === 'popular'}
              showListenerCount={view === 'popular'}
              isOpening={importingId === ep.id}
              onOpen={playCuratedEpisode}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {podcasts.map((p) => (
            <PodcastCardCompact
              key={p.id}
              data={{ type: 'curated', podcast: p }}
              isFollowed={followedFeedIds.has(p.feed_id)}
              isFollowing={followingFeedId === p.feed_id}
              onFollow={session ? followPodcast : undefined}
              onClick={(feedId) => navigate(`/podcast/show/${feedId}`)}
            />
          ))}
        </div>
      )}
      {view !== 'popular' && (
        <HubPager
          page={page}
          totalPages={Math.max(1, Math.ceil(total / HUB_PAGE_SIZE))}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
