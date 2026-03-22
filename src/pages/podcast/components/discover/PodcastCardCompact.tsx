import { Headphones, Heart, Loader2, Mic } from 'lucide-react';
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
  A1: 'bg-cefr-a1',
  A2: 'bg-cefr-a2',
  B1: 'bg-cefr-b1',
  B2: 'bg-cefr-b2',
  C1: 'bg-cefr-c1',
  C2: 'bg-cefr-c2',
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
  const rssUrl = isCurated
    ? (podcast as CuratedPodcast).rss_url
    : (podcast as PodcastIndexFeed).rssUrl;

  // FlexiLingo enrichment (from PodcastIndex search results)
  const flexilingo = !isCurated ? (podcast as PodcastIndexFeed).flexilingo : null;

  const cefrLevel = isCurated
    ? (podcast as CuratedPodcast).cefr_level
    : flexilingo?.cefr_level ?? null;
  const learningScore = isCurated
    ? (podcast as CuratedPodcast).learning_score
    : flexilingo?.learning_score ?? null;
  const episodeCount = isCurated
    ? `${(podcast as CuratedPodcast).transcribed_episodes}/${(podcast as CuratedPodcast).total_episodes}`
    : flexilingo
      ? `${flexilingo.transcribed_episodes}/${flexilingo.total_episodes}`
      : String((podcast as PodcastIndexFeed).episodeCount);

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
      className="w-[200px] shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:shadow-md hover:border-primary/30 active:scale-[0.98]"
    >
      {/* Image */}
      <div className="relative h-36 bg-muted/30 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Headphones className="h-10 w-10 text-muted-foreground/40" />
        )}

        {/* CEFR badge - top right */}
        {cefrLevel && (
          <span
            className={`absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-xs font-bold text-white ${CEFR_COLORS[cefrLevel] ?? 'bg-muted-foreground'}`}
          >
            {cefrLevel}
          </span>
        )}

        {/* Following badge - top left */}
        {isFollowed && (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/90 text-white">
            <Heart className="w-2.5 h-2.5 fill-current" />
            Following
          </span>
        )}

        {/* FlexiLingo badge - top left (when not followed) */}
        {!isFollowed && flexilingo && (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/90 text-primary-foreground">
            <Mic className="w-2.5 h-2.5" />
            FlexiLingo
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <h3 className="font-semibold text-sm text-foreground line-clamp-1 mb-0.5">{title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{author}</p>

        {/* Learning score */}
        {learningScore != null && (
          <div className="mb-2">
            <LearningScoreBar score={learningScore} />
          </div>
        )}

        {/* Footer: episode count + follow */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Mic className="w-3 h-3" />
            <span>{episodeCount} episodes</span>
          </div>
          {!isFollowed && onFollow && (
            <button
              onClick={handleFollow}
              disabled={isFollowing}
              className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5"
            >
              {isFollowing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Heart className="w-3 h-3" />
              )}
              Follow
            </button>
          )}
        </div>
      </div>
    </button>
  );
}
