import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, Clock, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuthStore } from '@/stores/authStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import {
  getMyFavoriteEpisodes,
  toggleFavoriteEpisode,
  type FavoriteEpisode,
} from '../../services/podcastAccount';
import { mergeFavourites, type SavedEntry } from '../../utils/accountMerge';
import type { CefrLevel } from '../../types';
import { CefrBadge } from '../hub/CefrBadge';
import { EpisodeRowShell, LibraryEmpty, LibraryError, RowsSkeleton } from './LibraryParts';

const LEVELS: readonly string[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
/** The API types the band as a free string; only the six real levels render. */
const asCefr = (v: string | null | undefined): CefrLevel | null =>
  v && LEVELS.includes(v) ? (v as CefrLevel) : null;

function formatDuration(seconds: number, t: TFunction): string | null {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  return m >= 60
    ? t('shared.durHM', { h: Math.floor(m / 60), m: m % 60 })
    : t('shared.minShort', { m });
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

  if (loading && entries.length === 0) return <RowsSkeleton />;

  if (loadError && entries.length === 0) {
    return <LibraryError message={t('unknownError')} retryLabel={t('retry')} onRetry={load} />;
  }

  if (entries.length === 0) {
    return (
      <LibraryEmpty
        icon={Bookmark}
        title={t('savedEpisodesEmptyTitle')}
        description={t('savedEpisodesEmptyDesc')}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {(error || loadError) && (
        <div
          role="alert"
          className="border-b border-border bg-error/10 px-4 py-2.5 text-[12.5px] text-foreground"
        >
          {error ?? loadError}
        </div>
      )}
      {entries.map((e) => {
        const busy = importingId === (e.localEpisodeId ?? e.cloud?.id);
        const duration = formatDuration(e.durationSeconds, t);
        const band = asCefr(e.cloud?.difficultyBand ?? e.cloud?.cefrLevel);
        return (
          <div key={e.key} className="group relative">
            <EpisodeRowShell
              imageUrl={e.imageUrl}
              title={e.title || t('savedEpisodeUnavailable')}
              show={e.showTitle}
              detail={
                <>
                  {duration && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {duration}
                    </span>
                  )}
                  {!e.available && <span className="text-error">{t('savedEpisodeGone')}</span>}
                </>
              }
              trailing={
                busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                ) : (
                  <CefrBadge level={band} />
                )
              }
              onClick={() => open(e)}
              disabled={!e.available || busy}
              dimmed={!e.available}
              rightInset
            />
            {/* Sits above the row rather than inside it, so un-saving never opens the player. */}
            <button
              type="button"
              onClick={() => remove(e)}
              disabled={removingKey === e.key}
              aria-label={t('savedEpisodeRemove')}
              title={t('savedEpisodeRemove')}
              className="absolute end-14 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[7px] text-accent opacity-0 transition-opacity hover:bg-accent/10 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
            >
              {removingKey === e.key ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bookmark className="h-4 w-4 fill-current" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
