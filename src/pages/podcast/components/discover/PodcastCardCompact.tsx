import { Headphones, Plus, Heart, Loader2 } from 'lucide-react';
import { LearningScoreBar } from './LearningScoreBar';
import type { CuratedPodcast, PodcastIndexFeed } from '../../types';

type PodcastData =
  | { type: 'curated'; podcast: CuratedPodcast }
  | { type: 'feed'; podcast: PodcastIndexFeed };

interface Props {
  data: PodcastData;
  isFollowed?: boolean;
  isFollowing?: boolean;
  onFollow?: (feedId: number) => void;
  onClick?: (feedId: number, rssUrl?: string) => void;
}

const CEFR_COLORS: Record<string, string> = {
  A1: 'bg-green-500',
  A2: 'bg-green-500',
  B1: 'bg-yellow-500',
  B2: 'bg-yellow-500',
  C1: 'bg-red-500',
  C2: 'bg-red-500',
};

export function PodcastCardCompact({ data, isFollowed, isFollowing, onFollow, onClick }: Props) {
  const isCurated = data.type === 'curated';
  const podcast = data.podcast;

  const feedId = isCurated ? (podcast as CuratedPodcast).feed_id : (podcast as PodcastIndexFeed).id;
  const title = podcast.title;
  const author = isCurated
    ? (podcast as CuratedPodcast).author
    : (podcast as PodcastIndexFeed).author;
  const imageUrl = isCurated
    ? (podcast as CuratedPodcast).image_url
    : (podcast as PodcastIndexFeed).image;
  const cefrLevel = isCurated ? (podcast as CuratedPodcast).cefr_level : null;
  const learningScore = isCurated ? (podcast as CuratedPodcast).learning_score : null;
  const rssUrl = isCurated
    ? (podcast as CuratedPodcast).rss_url
    : (podcast as PodcastIndexFeed).rssUrl;

  const handleClick = () => {
    onClick?.(feedId, rssUrl ?? undefined);
  };

  const handleFollow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isFollowed && !isFollowing) {
      onFollow?.(feedId);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="w-[140px] shrink-0 overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:shadow-md hover:border-primary/30 active:scale-[0.98]"
    >
      {/* Image */}
      <div className="relative h-[140px] w-[140px] bg-muted">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Headphones className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* CEFR badge */}
        {cefrLevel && (
          <span
            className={`absolute top-1.5 right-1.5 rounded px-1 py-0.5 text-[10px] font-bold text-white ${CEFR_COLORS[cefrLevel] ?? 'bg-muted-foreground'}`}
          >
            {cefrLevel}
          </span>
        )}

        {/* Followed heart */}
        {isFollowed && (
          <span className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-success">
            <Heart className="h-2.5 w-2.5 text-white fill-white" />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="space-y-1 p-2">
        <p className="text-xs font-semibold leading-4 text-foreground line-clamp-2">{title}</p>
        {author && <p className="text-[11px] leading-3 text-muted-foreground truncate">{author}</p>}

        {/* Learning score */}
        {learningScore != null && (
          <div className="pt-0.5">
            <LearningScoreBar score={learningScore} />
          </div>
        )}

        {/* Follow button */}
        {!isFollowed && onFollow && (
          <button
            onClick={handleFollow}
            disabled={isFollowing}
            className="mt-1 flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            {isFollowing ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Plus className="h-2.5 w-2.5" />
            )}
            Follow
          </button>
        )}
      </div>
    </button>
  );
}
