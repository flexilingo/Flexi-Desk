import { Loader2, Headphones } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EpisodeLevelCard } from './EpisodeLevelCard';
import type { EpisodeByLevel } from '../../types';

interface Props {
  episodes: EpisodeByLevel[];
  total: number;
  isLoading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPlay: (episode: EpisodeByLevel) => void | Promise<void>;
  onOpenPodcast?: (feedId: number) => void;
  /** Heading shown above the grid, e.g. "128 B1 episodes". */
  heading?: string;
}

/**
 * The results grid for the v2 episode-level browse. Filtering is owned by the
 * hub's single filter bar — a podcast is not uniformly one CEFR level, so picking
 * a level lists EPISODES, each with its own band and 0–100 difficulty score.
 */
export function EpisodeLevelGrid({
  episodes,
  total,
  isLoading,
  page,
  pageSize,
  onPageChange,
  onPlay,
  onOpenPodcast,
  heading,
}: Props) {
  const { t } = useTranslation('common');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isLoading) {
    return (
      <div className="flex min-h-50 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-12 text-center">
        <Headphones className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{t('podcast.levelEmpty')}</p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">
          {heading ?? t('podcast.levelEpisodeCount', { count: total })}
        </h2>
        <span className="text-xs text-muted-foreground">{t('podcast.sortEasiest')}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {episodes.map((ep) => (
          <EpisodeLevelCard
            key={ep.id}
            episode={ep}
            onPlay={onPlay}
            onOpenPodcast={onOpenPodcast}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t('podcast.previous')}
          </button>
          <span className="px-3 text-sm tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t('podcast.next')}
          </button>
        </div>
      )}
    </section>
  );
}
