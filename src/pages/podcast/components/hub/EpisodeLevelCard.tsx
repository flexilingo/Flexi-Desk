import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { relativeDays } from '../../utils/relativeDate';
import { Headphones, Play, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CefrBadge } from './CefrBadge';
import { PodcastLanguage } from './PodcastLanguage';
import type { CefrLevel, EpisodeByLevel } from '../../types';

interface Props {
  episode: EpisodeByLevel;
  /** Imports the cloud episode locally, then opens the player. */
  onPlay: (episode: EpisodeByLevel) => void | Promise<void>;
  /** Opens the parent podcast's detail page. */
  onOpenPodcast?: (feedId: number) => void;
}

/**
 * The score ring sits directly opposite the CEFR badge, so it borrows the badge's
 * own palette (success → accent → primary-dark) rather than the raw `cefr-*`
 * green/amber/red tokens, which would clash with the badge beside it.
 */
const SCORE_RING: Record<CefrLevel, string> = {
  A1: 'border-success/70 text-success',
  A2: 'border-success/70 text-success',
  B1: 'border-warning/70 text-warning',
  B2: 'border-warning/70 text-warning',
  C1: 'border-accent/70 text-accent',
  C2: 'border-accent/70 text-accent',
};
const SCORE_RING_FALLBACK = 'border-accent/70 text-accent';

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86_400_000);
}

function durationLabel(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Episode card for the "browse by level" grid (v2 difficulty model).
 *
 * A podcast is NOT uniformly one CEFR level — its episodes vary — so the level
 * browse lists EPISODES, each showing its own band + 0-100 difficulty score.
 * Image-forward: big square artwork, CEFR badge, score ring, direct play.
 */
export function EpisodeLevelCard({ episode, onPlay, onOpenPodcast }: Props) {
  const { t: tp } = useTranslation('podcastUi');
  const [imgError, setImgError] = useState(false);
  const [busy, setBusy] = useState(false);

  const days = daysSince(episode.publish_date);
  const date = days === null ? null : relativeDays(tp, days);
  const isNew = days !== null && days <= 2;
  const dur = durationLabel(episode.duration_seconds);
  const feedId = episode.feed_id;
  const scoreRing = episode.difficulty_band
    ? (SCORE_RING[episode.difficulty_band] ?? SCORE_RING_FALLBACK)
    : SCORE_RING_FALLBACK;

  // A wide band range means the scorer wasn't confident — show it honestly.
  const { difficulty_range_low: low, difficulty_range_high: high } = episode;
  const bandLabel = low && high && low !== high ? `${low}–${high}` : undefined;

  const play = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onPlay(episode);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_10px_28px_rgba(14,36,10,0.12)]">
      {/* Artwork */}
      <button type="button" onClick={play} className="block w-full text-left" disabled={busy}>
        <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted">
          {episode.image_url && !imgError ? (
            <img
              src={episode.image_url}
              alt={episode.title}
              loading="lazy"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <Headphones className="h-12 w-12 text-muted-foreground/30" />
          )}

          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-ink/55 to-transparent opacity-90"
          />

          {episode.difficulty_band && (
            <div className="absolute right-2 top-2 drop-shadow-[0_2px_6px_rgba(14,36,10,0.28)]">
              <CefrBadge level={episode.difficulty_band} size="md" label={bandLabel} />
            </div>
          )}

          {episode.difficulty_score != null && (
            <div
              className={cn(
                'absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-card/90 text-[10.5px] shadow-[0_2px_8px_rgba(14,36,10,0.20)] sm:h-9 sm:w-9 sm:text-[12px] font-extrabold tabular-nums backdrop-blur',
                scoreRing,
              )}
              title={tp('levelCard.difficultyTitle', { score: episode.difficulty_score })}
            >
              {episode.difficulty_score}
            </div>
          )}

          {dur && (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-ink/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-cream-50 backdrop-blur-sm">
              <Clock className="h-2.5 w-2.5" /> {dur}
            </span>
          )}

          <PodcastLanguage
            code={episode.difficulty_lang}
            variant="overlay"
            className="absolute bottom-2 left-2"
          />
        </div>
      </button>

      {/* Meta */}
      <div className="p-3">
        <button
          type="button"
          onClick={play}
          className="mb-1 block w-full text-left"
          disabled={busy}
        >
          <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
            {episode.title}
          </h3>
        </button>

        {episode.podcast_title &&
          (feedId !== null && onOpenPodcast ? (
            <button
              type="button"
              onClick={() => onOpenPodcast(feedId)}
              className="mb-2 -mx-1 flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted"
            >
              <p className="line-clamp-1 flex-1 text-[11.5px] text-muted-foreground">
                {episode.podcast_title}
              </p>
            </button>
          ) : (
            <p className="mb-2 line-clamp-1 text-[11.5px] text-muted-foreground">
              {episode.podcast_title}
            </p>
          ))}

        {date && (
          <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-caption">
            <span className={isNew ? 'font-semibold text-success' : undefined}>{date}</span>
          </div>
        )}
      </div>

      {/* Play button — overlaid on artwork only */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 flex aspect-square w-full items-center justify-center"
      >
        <button
          type="button"
          aria-label={tp('levelCard.playEpisode')}
          onClick={play}
          disabled={busy}
          className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-card/90 text-accent opacity-90 shadow-md sm:h-12 sm:w-12 backdrop-blur transition-all hover:scale-105 hover:bg-card group-hover:opacity-100 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Play className="h-5 w-5 translate-x-px fill-current" />
          )}
        </button>
      </div>
    </div>
  );
}
