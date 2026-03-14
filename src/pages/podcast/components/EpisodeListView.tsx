import { useEffect } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { usePodcastStore } from '../stores/podcastStore';
import { usePlayerStore } from '../stores/playerStore';
import { formatDuration } from '../types';
import type { PodcastEpisode, RawEpisodeDownloadProgress } from '../types';
import { mapEpisodeDownloadProgress } from '../types';

export function EpisodeListView() {
  const {
    activeFeed,
    episodes,
    isLoadingEpisodes,
    isDownloading,
    downloadProgress,
    goBack,
    refreshFeed,
    setDownloadProgress,
  } = usePodcastStore();

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen<RawEpisodeDownloadProgress>('podcast-download-progress', (event) => {
      setDownloadProgress(mapEpisodeDownloadProgress(event.payload));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setDownloadProgress]);

  if (!activeFeed) return null;

  const handleRefresh = () => {
    refreshFeed(activeFeed.id);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {activeFeed.artworkUrl && (
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md">
              <img
                src={activeFeed.artworkUrl}
                alt={activeFeed.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <CardTitle className="truncate">{activeFeed.title}</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              {activeFeed.author && <span>{activeFeed.author}</span>}
              <span>{activeFeed.episodeCount} episodes</span>
            </div>
          </div>

          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={handleRefresh} title="Refresh feed">
              <RefreshCw className="h-4 w-4" />
            </Button>
            {activeFeed.websiteUrl && (
              <a
                href={activeFeed.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoadingEpisodes ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : episodes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Headphones className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No episodes found</p>
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
      </CardContent>
    </Card>
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
  const { openPlayer, downloadEpisode, activeFeed } = usePodcastStore();
  const play = usePlayerStore((s) => s.play);
  const currentEpisode = usePlayerStore((s) => s.currentEpisode);
  const isCurrentPlaying = currentEpisode?.id === episode.id;

  const hasProgress = episode.playPosition > 0;
  const progressPct =
    episode.durationSeconds > 0
      ? Math.min((episode.playPosition / (episode.durationSeconds * 1000)) * 100, 100)
      : 0;

  const dateStr = episode.publishedAt
    ? new Date(episode.publishedAt).toLocaleDateString(undefined, {
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
      className={`group flex items-start gap-3 rounded-lg border px-3 py-3 transition-colors cursor-pointer hover:bg-muted/50 ${
        isCurrentPlaying
          ? 'border-primary/50 bg-primary/5'
          : 'border-transparent hover:border-border'
      }`}
      onClick={() => openPlayer(episode)}
    >
      {/* Play icon */}
      <button
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5 hover:bg-primary/20 transition-colors"
        onClick={handlePlay}
        title="Play"
      >
        {isCurrentPlaying ? (
          <Play className="h-4 w-4 text-primary fill-primary" />
        ) : episode.isPlayed ? (
          <Check className="h-4 w-4 text-[#8BB7A3]" />
        ) : (
          <Play className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <p
          className={`text-sm font-medium truncate ${episode.isPlayed && !isCurrentPlaying ? 'text-muted-foreground' : 'text-foreground'}`}
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
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {episode.cefrLevel}
            </Badge>
          )}
          {episode.isDownloaded && <HardDrive className="h-3 w-3 text-[#8BB7A3]" />}
          {episode.transcriptStatus === 'completed' && (
            <FileText className="h-3 w-3 text-[#8BB7A3]" />
          )}
        </div>

        {/* Progress bar */}
        {hasProgress && !episode.isPlayed && (
          <div className="h-1 w-full max-w-[200px] rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
          </div>
        )}

        {/* Download Progress */}
        {isDownloading && downloadPercent !== undefined && (
          <div className="h-1 w-full max-w-[200px] rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-[#C58C6E] transition-all duration-300"
              style={{ width: `${downloadPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {!episode.isDownloaded && !isDownloading && (
          <button
            className="opacity-0 group-hover:opacity-100 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            onClick={handleDownload}
            title="Download episode"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
        {isDownloading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}
