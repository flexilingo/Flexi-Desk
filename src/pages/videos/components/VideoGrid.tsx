import type { ReactNode } from 'react';
import type { VideoSummary } from '../lib/videosApi';
import { VideoCard } from './VideoCard';

export const GRID =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6';

interface Props {
  videos: VideoSummary[];
  isLoading?: boolean;
  /** A section heading (search results); the plain grid has none. */
  title?: string;
  icon?: ReactNode;
  skeletonCount?: number;
  emptyTitle?: string;
  emptySubtitle?: string;
}

/** Every video list shares this one grid and card. */
export function VideoGrid({
  videos,
  isLoading,
  title,
  icon,
  skeletonCount = 8,
  emptyTitle,
  emptySubtitle,
}: Props) {
  if (!isLoading && videos.length === 0 && !emptyTitle) return null;
  return (
    <section>
      {title && (
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
          {icon}
          {title}
        </h2>
      )}
      {isLoading ? (
        <div className={GRID}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="aspect-video animate-pulse bg-muted" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center">
          <p className="text-muted-foreground">{emptyTitle}</p>
          {emptySubtitle && <p className="mt-1.5 text-sm text-caption">{emptySubtitle}</p>}
        </div>
      ) : (
        <div className={GRID}>
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </section>
  );
}
