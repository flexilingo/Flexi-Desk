import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useAuthStore } from '@/stores/authStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import {
  getMyFavoriteEpisodes,
  toggleFavoriteEpisode,
  type FavoriteEpisode,
} from '../../services/podcastAccount';
import { mergeFavourites, type SavedEntry } from '../../utils/accountMerge';

function formatDuration(seconds: number): string | null {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/**
 * Saved episodes: the account's list (any device) merged with the episodes saved on this machine
 * (the bookmark button in the player, B). Signed out, the local ones still show.
 */
export function SavedEpisodesTab() {
  const { t } = useTranslation('podcastUi');
  const session = useAuthStore((s) => s.session);
  const local = useFavoritesStore((s) => s.local);
  const removeLocal = useFavoritesStore((s) => s.removeLocal);
  const { playFavoriteEpisode, openLocalEpisode, importingId, error } = useImportAndPlay();

  const [cloud, setCloud] = useState<FavoriteEpisode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getMyFavoriteEpisodes(100, 0);
      setCloud(res.favorites ?? []);
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const entries = useMemo(
    () => mergeFavourites(session ? cloud : [], local),
    [session, cloud, local],
  );

  const open = (e: SavedEntry) => {
    // A copy on this machine opens at once; otherwise the account's episode is brought in first.
    if (e.localEpisodeId) return openLocalEpisode(e.localEpisodeId);
    if (e.cloud) return playFavoriteEpisode(e.cloud);
  };

  const remove = async (e: SavedEntry) => {
    setRemovingKey(e.key);
    setLoadError(null);
    try {
      if (e.cloud && session) {
        await toggleFavoriteEpisode(e.cloud.videoId);
        setCloud((c) => c.filter((x) => x.videoId !== e.cloud?.videoId));
      }
      if (e.localEpisodeId) removeLocal(e.localEpisodeId);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setRemovingKey(null);
    }
  };

  if (loading && entries.length === 0) {
    return (
      <div className="flex justify-center py-14">
        <LoadingSpinner />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Bookmark className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground">{t('savedEpisodesEmptyTitle')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('savedEpisodesEmptyDesc')}</p>
        {loadError && <p className="text-sm text-error">{loadError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(error || loadError) && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
          {error ?? loadError}
        </div>
      )}
      {entries.map((e) => {
        const busy = importingId === (e.localEpisodeId ?? e.cloud?.id);
        const duration = formatDuration(e.durationSeconds);
        return (
          <div
            key={e.key}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <button
              type="button"
              onClick={() => open(e)}
              disabled={!e.available || busy}
              className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
            >
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                {e.imageUrl && (
                  <img
                    src={e.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {e.title || t('savedEpisodeUnavailable')}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[e.showTitle, duration, e.available ? null : t('savedEpisodeGone')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => remove(e)}
              disabled={removingKey === e.key}
              title={t('savedEpisodeRemove')}
              aria-label={t('savedEpisodeRemove')}
            >
              {removingKey === e.key ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
