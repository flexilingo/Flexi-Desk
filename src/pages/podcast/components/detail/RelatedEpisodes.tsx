import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { similarEpisodes, type SemanticHit } from '../../services/podcastSearch';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';

interface Props {
  /** curated_episodes.id of an episode of the show being viewed. */
  seedEpisodeId: string | null | undefined;
  /** The show being viewed: its own episodes are already listed above. */
  excludeFeedId?: number | null;
  /** Keep recommendations in the language being studied. */
  language?: string | null;
}

/**
 * Episodes from OTHER shows that cover the same ground, by what a show is ABOUT (cosine distance in the
 * semantic index). It renders nothing when the seed is not indexed, on purpose: an empty recommendation
 * row is worse than no row.
 */
export function RelatedEpisodes({ seedEpisodeId, excludeFeedId, language }: Props) {
  const { t } = useTranslation('podcastUi');
  const { playSemanticHit, importingId, error } = useImportAndPlay();
  const [hits, setHits] = useState<SemanticHit[]>([]);

  useEffect(() => {
    if (!seedEpisodeId) {
      setHits([]);
      return;
    }
    let cancelled = false;
    similarEpisodes(seedEpisodeId, language ? [language.toLowerCase().split('-')[0]] : undefined, 6)
      .then((res) => {
        if (cancelled) return;
        setHits(
          (res.results ?? []).filter((h) => {
            const ep = h.episode;
            // No audio url: the button would do nothing. Same show: already listed above.
            if (!ep?.feed_id || !ep.video_id || !ep.audio_url) return false;
            return excludeFeedId == null || ep.feed_id !== excludeFeedId;
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setHits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [seedEpisodeId, excludeFeedId, language]);

  if (hits.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[9px] border border-border bg-card shadow-xs">
      <div className="px-5 pb-2 pt-4">
        <h2 className="text-[15px] font-bold text-foreground">{t('relatedHeading')}</h2>
      </div>
      {error && <p className="px-5 pb-2 text-sm text-error">{error}</p>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3">
        {hits.map((hit) => {
          const ep = hit.episode!;
          return (
            <button
              key={hit.content_id}
              type="button"
              disabled={importingId === hit.content_id}
              onClick={() => playSemanticHit(hit)}
              className="flex w-full items-center gap-3 border-t border-border/60 px-5 py-3 text-start transition-colors hover:bg-muted/60 disabled:opacity-60"
            >
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[7px] bg-muted">
                {ep.image_url && (
                  <img
                    src={ep.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  dir="auto"
                  className="line-clamp-2 block text-[13px] font-semibold leading-snug text-foreground"
                >
                  {hit.title}
                </span>
                <span className="mt-1 line-clamp-1 block text-[11.5px] text-caption">
                  {[ep.podcast_title, hit.cefr_level, hit.language?.toUpperCase()]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {importingId === hit.content_id && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
