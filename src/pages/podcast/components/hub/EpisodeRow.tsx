import { Headphones, Play, Clock, Flame, Users, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CefrChip, ScoreChip } from './PodcastAnalysisChips';
import type { CuratedEpisodeLite } from '../../types';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatRelativeDate(date: string | null): string {
  if (!date) return '';
  const ms = Date.now() - new Date(date).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(date).toLocaleDateString();
}

interface Props {
  episode: CuratedEpisodeLite;
  index: number;
  showRank?: boolean;
  showListenerCount?: boolean;
  /** Opening imports the cloud episode into the local DB — it can take a moment. */
  isOpening?: boolean;
  onOpen: (ep: CuratedEpisodeLite) => void;
}

export function EpisodeRow({
  episode,
  index,
  showRank,
  showListenerCount,
  isOpening,
  onOpen,
}: Props) {
  const { t } = useTranslation('common');
  const thumbnail = episode.image_url || episode.podcast_image;

  let secondaryRight: React.ReactNode = null;
  if (showListenerCount && episode.listener_count && episode.listener_count > 0) {
    secondaryRight = (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-success">
        <Users className="h-3 w-3" />
        {t('podcast.listenersThisWeek', { count: episode.listener_count })}
      </span>
    );
  } else if (episode.publish_date) {
    secondaryRight = (
      <span className="text-[11px] text-muted-foreground">
        {formatRelativeDate(episode.publish_date)}
      </span>
    );
  }

  return (
    <button
      onClick={() => onOpen(episode)}
      disabled={isOpening}
      className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 hover:border-primary/30 disabled:opacity-60"
    >
      {/* Rank */}
      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
        {showRank && index <= 3 ? (
          <Flame
            className={`h-4 w-4 ${index === 1 ? 'text-accent' : index === 2 ? 'text-accent/80' : 'text-accent/60'}`}
          />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">{index}</span>
        )}
      </div>

      {/* Thumbnail */}
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Headphones className="h-4 w-4 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Play icon */}
      {isOpening ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
      ) : (
        <Play className="h-5 w-5 shrink-0 text-primary opacity-70 group-hover:opacity-100 fill-current" />
      )}

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{episode.title}</p>
        <div className="mt-0.5 flex items-center gap-2">
          {episode.podcast_title && (
            <span className="truncate text-[11px] text-muted-foreground">
              {episode.podcast_title}
            </span>
          )}
          {episode.podcast_title && secondaryRight && (
            <span className="text-[11px] text-muted-foreground">·</span>
          )}
          {secondaryRight}
        </div>
      </div>

      {/* Right: chips + duration */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex gap-1">
          <CefrChip level={episode.cefr_level} />
          <ScoreChip score={episode.learning_score} />
        </div>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
          <Clock className="h-3 w-3" />
          {formatDuration(episode.duration_seconds)}
        </span>
      </div>
    </button>
  );
}
