import { useState } from 'react';
import { CheckCircle2, Clock, Headphones, Loader2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { episodeDifficulty } from '../../utils/difficulty';
import { formatEpisodeDate, formatEpisodeDuration } from '../../utils/showEpisodes';
import type { CefrLevel, CuratedEpisodeLite } from '../../types';

/** Solid level tile on the cover, as the website's md CEFR badge (literal classes so Tailwind emits them). */
const LEVEL_TILE: Record<CefrLevel, string> = {
  A1: 'bg-cefr-a1',
  A2: 'bg-cefr-a2',
  B1: 'bg-cefr-b1',
  B2: 'bg-cefr-b2',
  C1: 'bg-cefr-c1',
  C2: 'bg-cefr-c2',
};

interface Props {
  episode: CuratedEpisodeLite;
  podcastImage: string | null;
  isOpening: boolean;
  onOpen: (ep: CuratedEpisodeLite) => void;
}

/**
 * One episode as a box: the website show page's image-forward card. Cover and title both play (the
 * desk has no separate episode page); the level sits on the cover once the episode is transcribed.
 */
export function DetailEpisodeCard({ episode, podcastImage, isOpening, onOpen }: Props) {
  const { t, i18n } = useTranslation('podcastUi');
  const [imgError, setImgError] = useState(false);

  const thumb = (!imgError && (episode.image_url || podcastImage)) || null;
  const isReady = episode.status === 'ready';
  const level = isReady ? episodeDifficulty(episode).level : null;
  const playable = !!episode.audio_url;
  const date = formatEpisodeDate(episode.publish_date, i18n.language);
  const duration = formatEpisodeDuration(episode.duration_seconds, i18n.language);

  return (
    <li className="group flex list-none flex-col overflow-hidden rounded-[9px] border border-border bg-card shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <button
        type="button"
        onClick={() => onOpen(episode)}
        disabled={!playable || isOpening}
        aria-label={episode.title}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-muted disabled:cursor-not-allowed"
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <Headphones className="h-10 w-10 text-caption/40" />
        )}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/50 to-transparent"
        />
        {level && (
          <span
            className={`absolute end-2 top-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold text-white drop-shadow dark:text-primary-foreground ${LEVEL_TILE[level]}`}
          >
            {level}
          </span>
        )}
        {duration && (
          <span className="absolute bottom-2 end-2 inline-flex items-center gap-1 rounded-[7px] bg-black/75 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-white">
            <Clock className="h-2.5 w-2.5" />
            {duration}
          </span>
        )}
        {playable && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card/95 text-primary shadow-sm transition-transform group-hover:scale-105">
              {isOpening ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Play className="h-5 w-5 translate-x-px fill-current" />
              )}
            </span>
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col p-3">
        <button
          type="button"
          onClick={() => onOpen(episode)}
          disabled={!playable || isOpening}
          dir="auto"
          className="line-clamp-2 text-start text-[13.5px] font-bold leading-snug text-foreground transition-colors hover:text-primary disabled:cursor-not-allowed"
        >
          {episode.title}
        </button>
        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-2 text-[11.5px] text-caption">
          {date && <span className="tabular-nums">{date}</span>}
          {isReady && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-success" />
              {t('show.subtitlesShort')}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
