import type { ReactNode } from 'react';
import { EpisodeLevelCard } from './EpisodeLevelCard';
import type { EpisodeByLevel } from '../../types';

export const CARD_GRID =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4';

/** Skeleton cards shaped like the real ones. */
export function CardSkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className={CARD_GRID}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="aspect-square animate-pulse bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  episodes: EpisodeByLevel[];
  isLoading?: boolean;
  skeletonCount?: number;
  onPlay: (episode: EpisodeByLevel) => void | Promise<void>;
  onOpenPodcast?: (feedId: number) => void;
  /** Optional section heading (search lanes); the hub's views are embedded and have none. */
  heading?: ReactNode;
}

/** The standard episode-card grid used by every episode list on the hub. */
export function EpisodeCardGrid({
  episodes,
  isLoading,
  skeletonCount = 6,
  onPlay,
  onOpenPodcast,
  heading,
}: Props) {
  return (
    <section>
      {heading}
      {isLoading ? (
        <CardSkeletonGrid count={skeletonCount} />
      ) : (
        <div className={CARD_GRID}>
          {episodes.map((ep) => (
            <EpisodeLevelCard
              key={ep.id}
              episode={ep}
              onPlay={onPlay}
              onOpenPodcast={onOpenPodcast}
            />
          ))}
        </div>
      )}
    </section>
  );
}
