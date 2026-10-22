import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  ArrowLeft,
  Clock,
  Play,
  Check,
  Headphones,
  RefreshCw,
  Download,
  HardDrive,
  Loader2,
  FileText,
  ExternalLink,
  Globe,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useNavigate, useParams } from 'react-router-dom';
import { usePodcastStore } from '../stores/podcastStore';
import { usePlayerStore } from '../stores/playerStore';
import { formatDuration } from '../types';
import type { PodcastEpisode, RawEpisodeDownloadProgress } from '../types';
import { mapEpisodeDownloadProgress } from '../types';
import { HERO_GRADIENT_CLASS, SAGE_PILL_CLASS } from './hub/PodcastAnalysisChips';
import { cn } from '@/lib/utils';

export function EpisodeListView() {
  const { t } = useTranslation('common');
  const { feedId } = useParams<{ feedId: string }>();
  const navigate = useNavigate();
  const {
    activeFeed,
    feeds,
    episodes,
    isLoadingEpisodes,
    isDownloading,
    downloadProgress,
    loadFeed,
    refreshFeed,
    setDownloadProgress,
  } = usePodcastStore();

  // Deep-link entry: /podcast/feed/:feedId may be opened cold, so resolve the
  // feed from the (already-fetched) local list rather than assuming the store
  // was primed by a click.
  useEffect(() => {
    if (!feedId || activeFeed?.id === feedId) return;
    const found = feeds.find((f) => f.id === feedId);
    if (found) loadFeed(found);
  }, [feedId, activeFeed?.id, feeds, loadFeed]);

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen<RawEpisodeDownloadProgress>('podcast-download-progress', (event) => {
      setDownloadProgress(mapEpisodeDownloadProgress(event.payload));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setDownloadProgress]);

  const [descExpanded, setDescExpanded] = useState(false);

  if (!activeFeed) return null;

  const handleRefresh = () => {
    refreshFeed(activeFeed.id);
  };

  const rawDescription = activeFeed.description ?? '';
  const description = rawDescription
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const showMoreBtn = description.length > 200;
  const displayedDescription =
    descExpanded || !showMoreBtn ? description : description.slice(0, 200) + '…';

  const readyCount = episodes.filter((e) => e.transcriptStatus === 'completed').length;

  return (
    <div className="space-y-4">
      {/* Hero card with gradient */}
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border p-5',
          HERO_GRADIENT_CLASS,
        )}
      >
        {/* Decorative blob */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-success/20 blur-3xl"
        />

        <div className="relative">
          {/* Back button + action buttons row */}
          <div className="mb-4 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              {t('podcast.back')}
            </Button>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                title={t('podcast.refreshFeed')}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              {activeFeed.websiteUrl && (
                <a
                  href={activeFeed.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* Main info row */}
          <div className="flex gap-4">
            {/* Cover */}
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-muted shadow-md">
              {activeFeed.artworkUrl ? (
                <img
                  src={activeFeed.artworkUrl}
                  alt={activeFeed.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Headphones className="h-10 w-10 text-muted-foreground/40" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              {/* Editor's Pick (if curated) + explicit TBD */}
              {readyCount > 0 && (
                <div
                  className={cn(
                    'mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                    SAGE_PILL_CLASS,
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {t('podcast.episodesReadyLabel', { count: readyCount })}
                </div>
              )}

              <h1 className="line-clamp-2 text-xl font-extrabold leading-tight text-foreground">
                {activeFeed.title}
              </h1>
              {activeFeed.author && (
                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                  {t('podcast.byAuthor', { author: activeFeed.author })}
                </p>
              )}

              {/* Meta chips */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {activeFeed.language && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    {activeFeed.language.toUpperCase()}
                  </span>
                )}
                {activeFeed.category && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {activeFeed.category}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {t('podcast.levelEpisodeCount', { count: activeFeed.episodeCount })}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          {description.length > 0 && (
            <div className="mt-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {displayedDescription}
              {showMoreBtn && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="ml-1 font-medium text-accent hover:underline focus:outline-none"
                >
                  {descExpanded ? t('podcast.showLess') : t('podcast.showMore')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Episode list */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold text-foreground">
            {t('podcast.episodesTitle')}
            <span className="ml-1.5 font-normal text-muted-foreground">({episodes.length})</span>
          </h2>
        </div>

        <div className="p-2">
          {isLoadingEpisodes ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : episodes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Headphones className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('podcast.noEpisodes')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {episodes.map((episode) => (
                <EpisodeRow
                  key={episode.id}
                  episode={episode}
                  isDownloading={isDownloading && downloadProgress?.episodeId === episode.id}
                  downloadPercent={
                    downloadProgress?.episodeId === episode.id ? downloadProgress.percent : 0
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EpisodeRow({
  episode,
  isDownloading,
  downloadPercent,
}: {
  episode: PodcastEpisode;
  isDownloading?: boolean;
  downloadPercent?: number;
}) {
  const { t, i18n } = useTranslation();
  const { loadEpisode, downloadEpisode, activeFeed } = usePodcastStore();
  const navigate = useNavigate();
  const play = usePlayerStore((s) => s.play);
  const currentEpisode = usePlayerStore((s) => s.currentEpisode);
  const isCurrentPlaying = currentEpisode?.id === episode.id;

  const hasProgress = episode.playPosition > 0;
  const progressPct =
    episode.durationSeconds > 0
      ? Math.min((episode.playPosition / (episode.durationSeconds * 1000)) * 100, 100)
      : 0;

  const dateStr = episode.publishedAt
    ? new Date(episode.publishedAt).toLocaleDateString(i18n.language, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    play(episode, activeFeed ?? undefined);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadEpisode(episode.id);
  };

  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-xl border px-3 py-3 transition-colors cursor-pointer hover:bg-muted/50',
        isCurrentPlaying
          ? 'border-primary/50 bg-primary/5'
          : 'border-transparent hover:border-border',
      )}
      onClick={() => {
        loadEpisode(episode);
        navigate(`/podcast/player/${episode.id}`);
      }}
    >
      {/* Play icon */}
      <button
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted transition-colors hover:bg-primary/20"
        onClick={handlePlay}
        title={t('podcast.play')}
      >
        {isCurrentPlaying ? (
          <Play className="h-4 w-4 fill-primary text-primary" />
        ) : episode.isPlayed ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Play className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            'truncate text-sm font-medium',
            episode.isPlayed && !isCurrentPlaying ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {episode.title}
        </p>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {episode.durationSeconds > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(episode.durationSeconds)}
            </span>
          )}
          {dateStr && <span>{dateStr}</span>}
          {episode.cefrLevel && (
            <span className="rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
              {episode.cefrLevel}
            </span>
          )}
          {episode.isDownloaded && <HardDrive className="h-3 w-3 text-success" />}
          {episode.transcriptStatus === 'completed' && (
            <FileText className="h-3 w-3 text-success" />
          )}
        </div>

        {/* Progress bar */}
        {hasProgress && !episode.isPlayed && (
          <div className="h-1 w-full max-w-50 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
          </div>
        )}

        {/* Download progress */}
        {isDownloading && downloadPercent !== undefined && (
          <div className="h-1 w-full max-w-50 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-warning transition-all duration-300"
              style={{ width: `${downloadPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-1">
        {!episode.isDownloaded && !isDownloading && (
          <button
            className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
            onClick={handleDownload}
            title={t('podcast.downloadEpisode')}
          >
            <Download className="h-4 w-4" />
          </button>
        )}
        {isDownloading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}
