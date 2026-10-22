import { useState } from 'react';
import { Headphones, Play, Loader2, Clock, Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { relativeDays } from '../../utils/relativeDate';
import { CefrChip, ScoreChip, ReadyChip } from '../hub/PodcastAnalysisChips';
import { episodeDifficulty } from '../../utils/difficulty';
import { isUnsupportedLanguage } from '../../utils/levelFit';
import type { CuratedEpisodeLite } from '../../types';

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRelativeDate(iso: string | null, tp: TFunction, locale: string): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return relativeDays(tp, days, 'week') ?? new Date(iso).toLocaleDateString(locale);
}

interface Props {
  episode: CuratedEpisodeLite;
  podcastImage: string | null;
  isOpening: boolean;
  onOpen: (ep: CuratedEpisodeLite) => void;
}

export function DetailEpisodeCard({ episode, podcastImage, isOpening, onOpen }: Props) {
  const { t, i18n } = useTranslation('common');
  const { t: tp } = useTranslation('podcastUi');
  const [imgError, setImgError] = useState(false);

  const thumb = (!imgError && (episode.image_url || podcastImage)) || null;
  const isReady = episode.status === 'ready';
  const { level, score } = episodeDifficulty(episode);
  const playable = !!episode.audio_url;

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <button
        type="button"
        onClick={() => onOpen(episode)}
        disabled={!playable || isOpening}
        className="relative block aspect-square w-full overflow-hidden bg-muted disabled:cursor-not-allowed"
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Headphones className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}

        {isReady && (
          <div className="absolute left-2 top-2">
            <ReadyChip label={t('podcast.subtitlesShort')} />
          </div>
        )}

        {playable && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-card/90 text-primary opacity-90 shadow-md backdrop-blur transition-transform group-hover:scale-105">
              {isOpening ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Play className="h-5 w-5 translate-x-px fill-current" />
              )}
            </span>
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col p-2.5">
        <p className="line-clamp-2 text-xs font-bold leading-snug text-foreground">
          {episode.title}
        </p>

        <div className="mt-1 flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground">
          <span>{formatRelativeDate(episode.publish_date, tp, i18n.language)}</span>
          <span aria-hidden className="h-0.75 w-0.75 rounded-full bg-muted-foreground/50" />
          <span className="inline-flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {formatDuration(episode.duration_seconds)}
          </span>
          {episode.speech_rate_wpm && (
            <>
              <span aria-hidden className="h-0.75 w-0.75 rounded-full bg-muted-foreground/50" />
              <span className="inline-flex items-center gap-0.5">
                <Gauge className="h-2.5 w-2.5" />
                {episode.speech_rate_wpm}
              </span>
            </>
          )}
        </div>

        {episode.status === 'failed' && (
          <span className="mt-auto pt-2 text-[10px] font-semibold uppercase tracking-wide text-error">
            {isUnsupportedLanguage(episode.error_message)
              ? tp('unsupportedLanguage')
              : tp('failed')}
          </span>
        )}

        {isReady && (level || score != null) && (
          <div className="mt-auto flex gap-1 pt-2">
            <CefrChip level={level} />
            <ScoreChip score={score} />
          </div>
        )}
      </div>
    </div>
  );
}
