import { useState } from 'react';
import { Headphones } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PodcastLanguage } from './PodcastLanguage';
import { WpmChip } from './PodcastAnalysisChips';
import { PodcastRangeChip } from './PodcastRangeChip';
import { CARD_GRID } from './EpisodeCardGrid';
import type { CefrLevel, CuratedPodcast, PodcastIndexFeed } from '../../types';

interface TileData {
  feedId: number;
  title: string;
  author: string | null;
  imageUrl: string | null;
  bandLow: CefrLevel | null;
  bandHigh: CefrLevel | null;
  wpm: number | null;
  episodeCount: number;
  language: string | null;
}

function toTile(p: CuratedPodcast | PodcastIndexFeed): TileData {
  if ('feed_id' in p) {
    return {
      feedId: p.feed_id,
      title: p.title,
      author: p.author,
      imageUrl: p.image_url,
      bandLow: p.difficulty_band_low ?? null,
      bandHigh: p.difficulty_band_high ?? null,
      wpm: p.avg_wpm,
      episodeCount: p.total_episodes,
      language: p.language ?? null,
    };
  }
  return {
    feedId: p.id,
    title: p.title,
    author: p.author,
    imageUrl: p.image,
    bandLow: null,
    bandHigh: null,
    wpm: p.flexilingo?.avg_wpm ?? null,
    episodeCount: p.episodeCount,
    language: p.language || null,
  };
}

/** One show tile: square artwork, level range top-right, language bottom-left, title, author, speed. */
export function PodcastTileCard({
  podcast,
  onOpen,
}: {
  podcast: CuratedPodcast | PodcastIndexFeed;
  onOpen: (feedId: number) => void;
}) {
  const { t } = useTranslation('podcastUi');
  const data = toTile(podcast);
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onOpen(data.feedId)}
      className="group block w-full overflow-hidden rounded-2xl border border-border bg-card text-start transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_10px_28px_rgba(14,36,10,0.12)]"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted">
        {data.imageUrl && !imgError ? (
          <img
            src={data.imageUrl}
            alt={data.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <Headphones className="h-12 w-12 text-caption/30" />
        )}
        <PodcastRangeChip
          low={data.bandLow}
          high={data.bandHigh}
          className="absolute right-2 top-2 drop-shadow-[0_2px_6px_rgba(14,36,10,0.28)]"
        />
        <PodcastLanguage
          code={data.language}
          variant="overlay"
          className="absolute bottom-2 left-2"
        />
      </div>
      <div className="p-3">
        <h3 className="mb-0.5 line-clamp-1 text-sm font-bold text-foreground transition-colors group-hover:text-accent">
          {data.title}
        </h3>
        <p className="mb-2 line-clamp-1 text-xs text-muted-foreground">
          {data.author || t('episodesCount', { count: data.episodeCount })}
        </p>
        {data.wpm ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <WpmChip wpm={data.wpm} />
          </div>
        ) : null}
      </div>
    </button>
  );
}

/** Loading skeleton, empty card and the grid of tiles, as the website's PodcastTileGrid. */
export function PodcastTileGrid({
  podcasts,
  isLoading,
  onOpen,
  total,
}: {
  podcasts: (CuratedPodcast | PodcastIndexFeed)[];
  isLoading?: boolean;
  onOpen: (feedId: number) => void;
  total?: number;
}) {
  const { t } = useTranslation('podcastUi');

  if (isLoading) {
    return (
      <div className={CARD_GRID}>
        {Array.from({ length: 12 }).map((_, i) => (
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
  if (podcasts.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card py-16 text-center">
        <Headphones className="mx-auto mb-4 h-12 w-12 text-caption/30" />
        <p className="text-muted-foreground">{t('noResults')}</p>
      </div>
    );
  }
  return (
    <div>
      {total !== undefined && total > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">{t('resultsCount', { count: total })}</p>
      )}
      <div className={CARD_GRID}>
        {podcasts.map((p) => (
          <PodcastTileCard key={'feed_id' in p ? p.feed_id : p.id} podcast={p} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
