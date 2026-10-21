import { Play, Headphones } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  HERO_GRADIENT_CLASS,
  SAGE_PILL_CLASS,
  CefrChip,
  WpmChip,
  ScoreChip,
} from './PodcastAnalysisChips';
import type { CuratedPodcast } from '../../types';

interface Props {
  podcast: CuratedPodcast;
  onListen: (podcast: CuratedPodcast) => void;
}

export function FeaturedPodcastCard({ podcast, onListen }: Props) {
  const { t } = useTranslation('common');

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border p-5 ${HERO_GRADIENT_CLASS}`}
    >
      {/* Decorative blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[#8BB7A3]/15 blur-3xl"
      />

      <div className="relative flex gap-4">
        {/* Cover */}
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted shadow-md">
          {podcast.image_url ? (
            <img
              src={podcast.image_url}
              alt={podcast.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Headphones className="h-8 w-8 text-muted-foreground/40" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          {/* Editor's Pick badge */}
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider mb-2',
              SAGE_PILL_CLASS,
            )}
          >
            <span className="h-1 w-1 rounded-full bg-[#3d6b58] dark:bg-[#a5c7b8]" />
            {t('podcast.editorsPick')}
          </div>

          <h3 className="line-clamp-2 text-base font-extrabold leading-tight text-foreground">
            {podcast.title}
          </h3>
          {podcast.author && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {t('podcast.byAuthor', { author: podcast.author })}
            </p>
          )}

          {/* Chips */}
          <div className="mt-2 flex flex-wrap gap-1">
            <CefrChip level={podcast.cefr_level} />
            <WpmChip wpm={podcast.avg_wpm} />
            <ScoreChip score={podcast.learning_score} />
          </div>

          {/* Listen Now */}
          <button
            onClick={() => onListen(podcast)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Play className="h-3 w-3 fill-current" />
            {t('podcast.listenNow')}
          </button>
        </div>
      </div>
    </div>
  );
}
