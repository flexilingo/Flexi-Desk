import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle2, History, Loader2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useAuthStore } from '@/stores/authStore';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import { getMyListeningHistory, type HistoryEpisode } from '../../services/podcastAccount';
import { mergeHistory, type HistoryEntry, type LocalListeningRow } from '../../utils/accountMerge';
import { stamp } from '../../utils/semantic';
import type { RawPodcastEpisode } from '../../types';

interface ListeningSnapshot {
  in_progress: LocalListeningRow[];
}

/**
 * Listening history: what this account played on any device (`my-listening-history`) merged with the
 * episodes in progress on this computer, one row per episode. A row resumes at the second it stopped.
 */
export function HistoryTab() {
  const { t } = useTranslation('podcastUi');
  const session = useAuthStore((s) => s.session);
  const { resumeHistoryEpisode, openLocalEpisode, importingId, error } = useImportAndPlay();

  const [cloud, setCloud] = useState<HistoryEpisode[]>([]);
  const [local, setLocal] = useState<LocalListeningRow[]>([]);
  const [videoIds, setVideoIds] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [snapshot, history] = await Promise.all([
        invoke<ListeningSnapshot>('overview_get_listening').catch(() => ({ in_progress: [] })),
        session ? getMyListeningHistory(50) : Promise.resolve({ history: [] as HistoryEpisode[] }),
      ]);
      // The catalogue id of each local row, so the same episode on both sides shows once.
      const ids: Record<string, string | null> = {};
      await Promise.all(
        snapshot.in_progress.map(async (r) => {
          try {
            const ep = await invoke<RawPodcastEpisode>('podcast_get_episode', { id: r.id });
            ids[r.id] = ep.video_id ?? null;
          } catch {
            ids[r.id] = null;
          }
        }),
      );
      setLocal(snapshot.in_progress);
      setVideoIds(ids);
      setCloud(history.history ?? []);
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const entries = useMemo(() => mergeHistory(cloud, local, videoIds), [cloud, local, videoIds]);

  const open = (e: HistoryEntry) => {
    const resumeAt = e.completed ? undefined : e.progressSeconds;
    // A copy on this machine opens at once; otherwise the account's episode is brought in first.
    if (e.localEpisodeId) return openLocalEpisode(e.localEpisodeId, resumeAt);
    if (e.cloud) return resumeHistoryEpisode(e.cloud);
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
          <History className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground">{t('historyEmptyTitle')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('historyEmptyDesc')}</p>
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
        const pct =
          e.durationSeconds > 0
            ? Math.min(100, Math.round((e.progressSeconds / e.durationSeconds) * 100))
            : 0;
        return (
          <button
            key={e.key}
            type="button"
            onClick={() => open(e)}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40 disabled:opacity-60"
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
              <span className="block truncate text-sm font-medium text-foreground">{e.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{e.showTitle}</span>
              {!e.completed && e.durationSeconds > 0 && (
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {stamp(e.progressSeconds)}
                  </span>
                </span>
              )}
            </span>
            {busy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : e.completed ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t('historyCompleted')}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                <Play className="h-3.5 w-3.5" />
                {t('resume')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
