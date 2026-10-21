import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Headphones,
  Heart,
  HeartOff,
  Loader2,
  RefreshCw,
  Wand2,
  Globe,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { CefrChip, WpmChip, ScoreChip } from '../hub/PodcastAnalysisChips';
import { usePodcastDetailStore } from '../../stores/podcastDetailStore';
import { useDiscoverStore } from '../../stores/discoverStore';
import { useAuthStore } from '@/stores/authStore';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import { DetailEpisodeCard } from './DetailEpisodeCard';
import { RequestPodcastPanel } from './RequestPodcastPanel';
import type { CuratedEpisodeLite } from '../../types';

const PAGE_SIZE = 20;

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
      <div className="text-lg font-extrabold tabular-nums text-primary">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export function PodcastDetailView() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { feedId: feedIdParam } = useParams<{ feedId: string }>();
  const feedId = Number(feedIdParam);

  const session = useAuthStore((s) => s.session);
  const {
    podcast,
    curated,
    episodes,
    isLoading,
    isEpisodesLoading,
    notFound,
    error,
    isRefreshing,
    refreshResult,
    load,
    refreshEpisodes,
    clearRefreshResult,
    clear,
  } = usePodcastDetailStore();

  const {
    followedFeedIds,
    followedPodcasts,
    followingFeedId,
    updatingFollowFeedId,
    fetchFollowed,
    followPodcast,
    unfollowPodcast,
    setAutoTranscribe,
  } = useDiscoverStore();

  const { playCuratedEpisode, importingId, error: importError } = useImportAndPlay();

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [rssCopied, setRssCopied] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    if (Number.isFinite(feedId)) load(feedId);
    setVisibleCount(PAGE_SIZE);
    return () => clear();
  }, [feedId, load, clear]);

  useEffect(() => {
    if (session) fetchFollowed();
  }, [session, fetchFollowed]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (notFound || !podcast) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Headphones className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">{t('podcast.podcastNotFound')}</p>
        {error && <p className="max-w-md text-xs text-muted-foreground">{error}</p>}
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const isFollowed = followedFeedIds.has(feedId);
  const follow = followedPodcasts.find((p) => p.feed_id === feedId);
  const isFollowBusy = followingFeedId === feedId;
  const isAutoBusy = updatingFollowFeedId === feedId;

  const analyzedCount = episodes.filter((e) => e.status === 'ready').length;
  const visible = episodes.slice(0, visibleCount);
  const description = curated?.description || podcast.description || '';
  const isLongDesc = description.length > 300;

  const openEpisode = (ep: CuratedEpisodeLite) =>
    playCuratedEpisode({
      ...ep,
      podcast_title: podcast.title,
      podcast_image: curated?.image_url ?? podcast.image,
    });

  const copyRss = async () => {
    if (!podcast.rssUrl) return;
    await navigator.clipboard.writeText(podcast.rssUrl);
    setRssCopied(true);
    setTimeout(() => setRssCopied(false), 1600);
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')}
      </Button>

      {(error || importError) && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
          {importError ?? error}
        </div>
      )}

      {/* Hero */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row">
        <div className="h-32 w-32 shrink-0 overflow-hidden rounded-xl bg-muted">
          {curated?.image_url || podcast.image ? (
            <img
              src={curated?.image_url ?? podcast.image}
              alt={podcast.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Headphones className="h-10 w-10 text-muted-foreground/40" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {curated && (
              <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                {t('podcast.editorsPick')}
              </span>
            )}
            {podcast.isExplicit && (
              <span className="rounded-full border border-error/40 bg-error/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-error">
                {t('podcast.explicitContent')}
              </span>
            )}
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            {podcast.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {podcast.author || podcast.ownerName || '—'}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <CefrChip level={curated?.cefr_level} />
            <WpmChip wpm={curated?.avg_wpm} />
            <ScoreChip score={curated?.learning_score} />
            {podcast.language && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <Globe className="h-3 w-3" />
                {podcast.language}
              </span>
            )}
          </div>

          {/* Account actions */}
          {session && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant={isFollowed ? 'outline' : 'default'}
                size="sm"
                disabled={isFollowBusy}
                onClick={() => (isFollowed ? unfollowPodcast(feedId) : followPodcast(feedId))}
              >
                {isFollowBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isFollowed ? (
                  <HeartOff className="h-4 w-4" />
                ) : (
                  <Heart className="h-4 w-4" />
                )}
                {isFollowed ? t('podcast.unfollow') : t('podcast.follow')}
              </Button>

              {isFollowed && (
                <>
                  <Button
                    variant={follow?.auto_transcribe ? 'default' : 'outline'}
                    size="sm"
                    disabled={isAutoBusy}
                    title={t('podcast.autoTranscribeHint')}
                    onClick={() => setAutoTranscribe(feedId, !follow?.auto_transcribe)}
                  >
                    {isAutoBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    {t('podcast.autoTranscribe')}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isRefreshing}
                    onClick={() => refreshEpisodes(feedId)}
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {t('podcast.checkForNew')}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* refresh-user-episodes result */}
      {refreshResult && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
            refreshResult.credit_exhausted
              ? 'border-warning/40 bg-warning/10 text-warning'
              : 'border-success/30 bg-success/10 text-success'
          }`}
        >
          {refreshResult.credit_exhausted ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="flex-1">
            <p className="font-semibold">
              {t('podcast.refreshDiscovered', { count: refreshResult.discovered })}
            </p>
            {refreshResult.auto_transcribed > 0 && (
              <p className="text-xs opacity-90">
                {t('podcast.refreshAutoTranscribed', { count: refreshResult.auto_transcribed })}
              </p>
            )}
            {refreshResult.credit_exhausted && (
              <p className="text-xs opacity-90">{t('podcast.refreshCreditExhausted')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={clearRefreshResult}
            className="text-xs font-semibold underline underline-offset-2"
          >
            {t('podcast.dismiss')}
          </button>
        </div>
      )}

      {/* Stats — only meaningful once curated */}
      {curated && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCell
            value={analyzedCount > 0 ? String(analyzedCount) : '—'}
            label={t('podcast.statsReadyEpisodes')}
          />
          <StatCell
            value={curated.avg_wpm ? String(curated.avg_wpm) : '—'}
            label={t('podcast.statsWpm')}
          />
          <StatCell
            value={
              curated.difficulty_band_low && curated.difficulty_band_high
                ? curated.difficulty_band_low === curated.difficulty_band_high
                  ? curated.difficulty_band_low
                  : `${curated.difficulty_band_low}–${curated.difficulty_band_high}`
                : (curated.cefr_level ?? '—')
            }
            label={t('podcast.statsCefrRange')}
          />
          <StatCell
            value={
              curated.difficulty_score_median != null
                ? String(curated.difficulty_score_median)
                : curated.learning_score != null
                  ? String(curated.learning_score)
                  : '—'
            }
            label={t('podcast.statsLearningScore')}
          />
        </div>
      )}

      {/* Request-a-podcast — only when not curated */}
      {!curated && <RequestPodcastPanel feedId={feedId} />}

      {/* Description */}
      {description && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p
            className={`whitespace-pre-line text-sm leading-relaxed text-muted-foreground ${
              !descExpanded && isLongDesc ? 'line-clamp-4' : ''
            }`}
          >
            {description}
          </p>
          {isLongDesc && (
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              className="mt-2 text-xs font-semibold text-primary hover:underline"
            >
              {descExpanded ? t('podcast.showLess') : t('podcast.showMore')}
            </button>
          )}
        </div>
      )}

      {/* Links */}
      {(podcast.websiteUrl || podcast.rssUrl || podcast.itunesId) && (
        <div className="flex flex-wrap items-center gap-2">
          {podcast.websiteUrl && (
            <a
              href={podcast.websiteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('podcast.visitWebsite')}
            </a>
          )}
          {podcast.rssUrl && (
            <Button variant="outline" size="sm" onClick={copyRss}>
              {rssCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {rssCopied ? t('podcast.copied') : t('podcast.copyRss')}
            </Button>
          )}
          {podcast.itunesId && (
            <a
              href={`https://podcasts.apple.com/podcast/id${podcast.itunesId}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('podcast.listenOnApple')}
            </a>
          )}
        </div>
      )}

      {/* Episodes */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-foreground">
            {t('podcast.episodesTitle')}{' '}
            <span className="text-muted-foreground">({episodes.length})</span>
          </h2>
          {analyzedCount > 0 && (
            <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
              {t('podcast.episodesReadyLabel', { count: analyzedCount })}
            </span>
          )}
        </div>

        {isEpisodesLoading ? (
          <div className="flex justify-center py-14">
            <LoadingSpinner />
          </div>
        ) : episodes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
            <Headphones className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('podcast.noEpisodes')}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {visible.map((ep) => (
                <DetailEpisodeCard
                  key={ep.id}
                  episode={ep}
                  podcastImage={curated?.image_url ?? podcast.image ?? null}
                  isOpening={importingId === ep.id}
                  onOpen={openEpisode}
                />
              ))}
            </div>

            {visibleCount < episodes.length && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  {t('podcast.showMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
