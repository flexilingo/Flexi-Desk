import { useState } from 'react';
import { Headphones, Play, Clock, Globe, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CefrBadge } from '@/components/common/CefrBadge';
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
  A1: 'border-success/60 text-success',
  A2: 'border-success/60 text-success',
  B1: 'border-accent/60 text-accent',
  B2: 'border-accent/60 text-accent',
  C1: 'border-primary-dark/60 text-primary-dark',
  C2: 'border-primary-dark/60 text-primary-dark',
};
const SCORE_RING_FALLBACK = 'border-border text-muted-foreground';

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86_400_000);
}

function relativeDate(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
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
  const [imgError, setImgError] = useState(false);
  const [busy, setBusy] = useState(false);

  const days = daysSince(episode.publish_date);
  const date = relativeDate(days);
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
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
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
            className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/55 to-transparent opacity-90"
          />

          {episode.difficulty_band && (
            <CefrBadge
              level={episode.difficulty_band}
              label={bandLabel}
              className="absolute right-2 top-2 bg-card/90 shadow-sm backdrop-blur"
            />
          )}

          {episode.difficulty_score != null && (
            <div
              className={cn(
                'absolute left-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border-2 bg-card/90 text-[12px] font-extrabold tabular-nums backdrop-blur',
                scoreRing,
              )}
              title={`Difficulty ${episode.difficulty_score}/100`}
            >
              {episode.difficulty_score}
            </div>
          )}

          {dur && (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
              <Clock className="h-2.5 w-2.5" /> {dur}
            </span>
          )}
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

        <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
          {date && <span className={isNew ? 'font-semibold text-success' : undefined}>{date}</span>}
          {date && episode.difficulty_lang && (
            <span aria-hidden className="h-0.75 w-0.75 rounded-full bg-muted-foreground/50" />
          )}
          {episode.difficulty_lang && (
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" /> {episode.difficulty_lang.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Play button — overlaid on artwork only */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 flex aspect-square w-full items-center justify-center"
      >
        <button
          type="button"
          aria-label="Play episode"
          onClick={play}
          disabled={busy}
          className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-card/90 text-primary opacity-90 shadow-md backdrop-blur transition-all hover:scale-105 hover:bg-card group-hover:opacity-100 disabled:opacity-60"
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
