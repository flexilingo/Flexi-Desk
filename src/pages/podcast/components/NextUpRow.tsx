import { useEffect, useState } from 'react';
import { Headphones, Loader2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getEpisodesByLevel } from '../services/podcastCloud';
import { useImportAndPlay } from '../hooks/useImportAndPlay';
import type { CefrLevel, EpisodeByLevel } from '../types';

interface Props {
  /** Band to recommend at — the episode the user just finished. */
  level: CefrLevel;
  /** Local id of the finished episode, so we don't recommend it back. */
  excludeVideoId?: string;
}

/**
 * "Next up" after finishing an episode: more episodes at the same CEFR band,
 * from the cloud catalog. Renders nothing when offline or when the catalog has
 * no other episodes at this level — an empty row is worse than no row.
 */
export function NextUpRow({ level, excludeVideoId }: Props) {
  const { t } = useTranslation('common');
  const [episodes, setEpisodes] = useState<EpisodeByLevel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { playEpisodeByLevel, importingId } = useImportAndPlay();

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getEpisodesByLevel({ level, sort: 'newest', page: 1, limit: 4 })
      .then((res) => {
        if (cancelled) return;
        setEpisodes((res.episodes ?? []).filter((e) => e.video_id !== excludeVideoId).slice(0, 3));
      })
      .catch(() => {
        // Offline / cloud down — the overlay still works without this row.
        if (!cancelled) setEpisodes([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [level, excludeVideoId]);

  if (isLoading) {
    return (
      <div className="flex justify-center border-b border-border py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (episodes.length === 0) return null;

  return (
    <div className="space-y-2 border-b border-border px-4 py-3">
      <div>
        <p className="text-xs font-bold text-foreground">{t('podcast.nextUpTitle')}</p>
        <p className="text-[10px] text-muted-foreground">{t('podcast.nextUpHint')}</p>
      </div>

      <div className="space-y-1.5">
        {episodes.map((ep) => (
          <button
            key={ep.id}
            type="button"
            disabled={importingId === ep.id}
            onClick={() => playEpisodeByLevel(ep)}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-border bg-card p-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/50 disabled:opacity-60"
          >
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
              {ep.image_url ? (
                <img
                  src={ep.image_url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Headphones className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-foreground">{ep.title}</p>
              {ep.podcast_title && (
                <p className="truncate text-[10px] text-muted-foreground">{ep.podcast_title}</p>
              )}
            </div>

            {importingId === ep.id ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : (
              <Play className="h-4 w-4 shrink-0 fill-current text-primary opacity-70 group-hover:opacity-100" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
