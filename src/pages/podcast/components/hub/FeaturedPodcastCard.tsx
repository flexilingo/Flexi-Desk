import { useState } from 'react';
import { Headphones, Play, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PodcastLanguage } from './PodcastLanguage';
import { WpmChip } from './PodcastAnalysisChips';
import { PodcastRangeChip } from './PodcastRangeChip';
import type { CuratedPodcast } from '../../types';

interface Props {
  podcast: CuratedPodcast;
  onListen: (podcast: CuratedPodcast) => void;
}

/** The hub's editor's pick: artwork panel on the left, story and the two calls to action on the right. */
export function FeaturedPodcastCard({ podcast, onListen }: Props) {
  const { t } = useTranslation('podcastUi');
  const { t: tc } = useTranslation('common');
  const [imgError, setImgError] = useState(false);

  const totalEps =
    podcast.total_episodes > 0
      ? `${podcast.transcribed_episodes}/${podcast.total_episodes} ${t('episodes')}`
      : null;

  return (
    <button
      type="button"
      onClick={() => onListen(podcast)}
      className="group grid w-full grid-cols-1 overflow-hidden rounded-2xl border border-border bg-card text-start transition-all hover:shadow-xl sm:grid-cols-[200px_1fr] md:grid-cols-[220px_1fr]"
    >
      {/* Left: artwork panel */}
      <div className="relative flex min-h-[200px] flex-col items-center justify-center gap-3 overflow-hidden bg-gradient-to-br from-primary-dark to-primary-light p-6 sm:min-h-0">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl shadow-2xl transition-transform duration-300 group-hover:scale-[1.03] md:h-32 md:w-32">
          {podcast.image_url && !imgError ? (
            <img
              src={podcast.image_url}
              alt={podcast.title}
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary-light">
              <Headphones className="h-10 w-10 text-white/50" />
            </div>
          )}
        </div>
        {totalEps && (
          <div className="relative z-10 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/85 backdrop-blur-sm">
            {totalEps}
          </div>
        )}
      </div>

      {/* Right: info */}
      <div className="flex flex-col justify-between gap-4 p-6 md:p-7">
        <div className="flex flex-col gap-2.5">
          <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent">
            <Sparkles className="h-3 w-3" />
            {tc('podcast.editorsPick')}
          </div>
          <h2 className="line-clamp-2 text-xl font-extrabold leading-tight tracking-tight text-foreground md:text-2xl">
            {podcast.title}
          </h2>
          {podcast.description && (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {podcast.description}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <PodcastLanguage
              code={podcast.language}
              className="text-xs font-semibold text-caption"
              iconClassName="h-3.5 w-3.5"
            />
            {podcast.avg_wpm ? <WpmChip wpm={podcast.avg_wpm} /> : null}
            <PodcastRangeChip
              low={podcast.difficulty_band_low}
              high={podcast.difficulty_band_high}
            />
            {podcast.owner_name && (
              <span className="flex items-center gap-1 text-xs font-semibold text-caption">
                <Users className="h-3.5 w-3.5" />
                {podcast.owner_name}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-[9px] bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground shadow-sm transition-colors group-hover:bg-accent/90">
              <Play className="h-4 w-4 fill-current" />
              {t('startLearning')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-transparent px-4 py-2.5 text-sm font-semibold text-foreground transition-colors group-hover:border-accent/40 group-hover:bg-muted">
              {tc('podcast.follow')}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
