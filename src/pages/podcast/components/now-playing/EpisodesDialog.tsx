import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListVideo, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePodcastStore } from '../../stores/podcastStore';
import type { PodcastEpisode, PodcastFeed } from '../../types';
import { cn } from '@/lib/utils';
import { CARD_ICON_BUTTON } from './CardActions';

const CEFR_COLORS: Record<string, string> = {
  A1: 'bg-cefr-a1 text-white',
  A2: 'bg-cefr-a2 text-white',
  B1: 'bg-cefr-b1 text-white',
  B2: 'bg-cefr-b2 text-white',
  C1: 'bg-cefr-c1 text-white',
  C2: 'bg-cefr-c2 text-white',
};

/**
 * The show's episodes, to jump between them without leaving the player (website:
 * `EpisodesPopover`, bare): newest first, the open one pinned and marked "Now playing".
 */
export function EpisodesDialog({ feed, currentId }: { feed: PodcastFeed; currentId: string }) {
  const { t } = useTranslation('podcastUi');
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PodcastEpisode[] | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const currentRowRef = useRef<HTMLButtonElement>(null);
  const fetchEpisodes = usePodcastStore((s) => s.fetchEpisodes);
  const loadEpisode = usePodcastStore((s) => s.loadEpisode);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setRows(null);
    void fetchEpisodes(feed.id).then(() => {
      if (live) setRows(usePodcastStore.getState().episodes.filter((e) => e.feedId === feed.id));
    });
    return () => {
      live = false;
    };
  }, [open, feed.id, fetchEpisodes]);

  useEffect(() => {
    if (!open || !rows?.length) return;
    const id = window.setTimeout(
      () => currentRowRef.current?.scrollIntoView?.({ block: 'center' }),
      50,
    );
    return () => window.clearTimeout(id);
  }, [open, rows]);

  const go = (ep: PodcastEpisode) => {
    if (ep.id === currentId) return;
    setOpen(false);
    loadEpisode(ep, feed);
    // replace: hopping episode to episode must not stack history.
    navigate(`/podcast/player/${ep.id}`, { replace: true });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('np.episodes')}
        aria-label={t('np.episodes')}
        className={CARD_ICON_BUTTON}
      >
        <ListVideo className="h-[18px] w-[18px]" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 pb-3 pt-5">
            <DialogTitle>{t('np.episodes')}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows === null ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('np.loadingEpisodes')}
              </div>
            ) : rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('np.noEpisodes')}
              </p>
            ) : (
              <div className="flex flex-col gap-1 p-2">
                {rows.map((row) => {
                  const isCurrent = row.id === currentId;
                  const image = row.imageUrl ?? feed.artworkUrl;
                  const level = row.difficultyBand ?? row.cefrLevel ?? null;
                  return (
                    <button
                      key={row.id}
                      ref={isCurrent ? currentRowRef : undefined}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => go(row)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border px-2.5 py-2 text-start transition-colors',
                        isCurrent
                          ? 'cursor-default border-accent/40 bg-accent/12'
                          : 'border-transparent hover:bg-muted',
                      )}
                    >
                      {image && !failed.has(image) ? (
                        <img
                          src={image}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-lg object-cover shadow-xs"
                          onError={() => setFailed((prev) => new Set(prev).add(image))}
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <ListVideo className="h-4 w-4 text-accent" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          dir="auto"
                          className={cn(
                            'line-clamp-2 text-xs font-semibold leading-snug',
                            isCurrent ? 'text-accent' : 'text-foreground',
                          )}
                        >
                          {row.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                              {t('np.nowPlaying')}
                            </span>
                          )}
                          {level && (
                            <span
                              className={cn(
                                'rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none',
                                CEFR_COLORS[level] ?? 'bg-muted text-foreground',
                              )}
                            >
                              {level}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
