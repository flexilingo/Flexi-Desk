import { Loader2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { EpisodeMomentChip } from './EpisodeMomentChip';
import { MOMENT_ROWS } from '../../utils/semantic';
import type { SemanticHit } from '../../services/podcastSearch';

interface Props {
  hits: SemanticHit[];
  isLoading?: boolean;
  /** The phrase that produced these hits: needed to locate the moment inside each. */
  query: string;
  openingId?: string | null;
  onOpen: (hit: SemanticHit, startAt?: number) => void;
}

function formatDuration(seconds: number | null | undefined, t: TFunction): string | null {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  return m >= 60
    ? t('shared.durHM', { h: Math.floor(m / 60), m: m % 60 })
    : t('shared.minShort', { m });
}

/**
 * Episodes found by meaning rather than keyword: what is SAID inside them. Under the keyword lanes,
 * and it renders nothing when it has nothing, so it is safe to leave mounted for every search.
 */
export function SemanticEpisodeResults({ hits, isLoading, query, openingId, onOpen }: Props) {
  const { t } = useTranslation('podcastUi');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  const episodes = hits.filter((h) => h.content_type === 'podcast_episode' && h.episode);
  if (episodes.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </span>
          <h3 className="text-sm font-bold text-foreground">{t('semanticHeading')}</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t('semanticSubheading')}</p>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {episodes.map((hit, i) => {
          const ep = hit.episode!;
          const duration = formatDuration(ep.duration_seconds, t);
          return (
            <div
              key={`${hit.content_id}-${hit.passage_index}`}
              className="flex gap-3 p-3 hover:bg-muted/40"
            >
              <button
                type="button"
                onClick={() => onOpen(hit)}
                disabled={openingId === hit.content_id}
                className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted"
                tabIndex={-1}
                aria-hidden
              >
                {ep.image_url && (
                  <img
                    src={ep.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onOpen(hit)}
                  disabled={openingId === hit.content_id}
                  className="block w-full text-left"
                >
                  <p className="line-clamp-1 text-sm font-medium text-foreground">{hit.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {[ep.podcast_title, duration, hit.cefr_level, hit.language?.toUpperCase()]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {hit.excerpt && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hit.excerpt}</p>
                  )}
                </button>
                <EpisodeMomentChip
                  contentId={hit.content_id}
                  query={query}
                  enabled={i < MOMENT_ROWS}
                  onJump={(second) => onOpen(hit, second)}
                />
              </div>
              {openingId === hit.content_id && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
