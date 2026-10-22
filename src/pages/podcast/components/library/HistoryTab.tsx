import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import { getMyListeningHistory, type HistoryEpisode } from '../../services/podcastAccount';
import { mergeHistory, type HistoryEntry, type LocalListeningRow } from '../../utils/accountMerge';
import { stamp } from '../../utils/semantic';
import type { CefrLevel, RawPodcastEpisode } from '../../types';
import { CefrBadge } from '../hub/CefrBadge';
import { EpisodeRowShell, LibraryEmpty, LibraryError, RowsSkeleton } from './LibraryParts';

const LEVELS: readonly string[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const asCefr = (v: string | null | undefined): CefrLevel | null =>
  v && LEVELS.includes(v) ? (v as CefrLevel) : null;

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

  if (loading && entries.length === 0) return <RowsSkeleton />;

  if (loadError && entries.length === 0) {
    return <LibraryError message={t('unknownError')} retryLabel={t('retry')} onRetry={load} />;
  }

  if (entries.length === 0) {
    return (
      <LibraryEmpty
        icon={Clock}
        title={t('historyEmptyTitle')}
        description={t('historyEmptyDesc')}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {error && (
        <div
          role="alert"
          className="border-b border-border bg-error/10 px-4 py-2.5 text-[12.5px] text-foreground"
        >
          {error}
        </div>
      )}
      {entries.map((e) => {
        const busy = importingId === (e.localEpisodeId ?? e.cloud?.id);
        const ratio =
          e.durationSeconds > 0 ? Math.min(1, e.progressSeconds / e.durationSeconds) : 0;
        const band = asCefr(e.cloud?.difficulty_band ?? e.cloud?.cefr_level);
        return (
          <EpisodeRowShell
            key={e.key}
            imageUrl={e.imageUrl}
            title={e.title}
            show={e.showTitle}
            detail={
              e.completed ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('historyCompleted')}
                </span>
              ) : (
                <>
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </div>
                  {e.durationSeconds > 0 && (
                    <span className="tabular-nums">
                      {stamp(e.progressSeconds)} / {stamp(e.durationSeconds)}
                    </span>
                  )}
                </>
              )
            }
            trailing={
              busy ? (
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
              ) : (
                <CefrBadge level={band} />
              )
            }
            onClick={() => open(e)}
            disabled={busy}
          />
        );
      })}
    </div>
  );
}
