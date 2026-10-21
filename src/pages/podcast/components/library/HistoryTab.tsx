import { useEffect } from 'react';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useDiscoverStore } from '../../stores/discoverStore';
import { useAuthStore } from '@/stores/authStore';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import { EpisodeRow } from '../hub/EpisodeRow';
import { SignedOutNotice } from './SignedOutNotice';

export function HistoryTab() {
  const { t } = useTranslation('common');
  const session = useAuthStore((s) => s.session);
  const { historyEpisodes, isHistoryLoading, fetchHistory } = useDiscoverStore();
  const { playCuratedEpisode, importingId, error } = useImportAndPlay();

  useEffect(() => {
    if (session) fetchHistory();
  }, [session, fetchHistory]);

  if (!session) return <SignedOutNotice message={t('podcast.signInForHistory')} />;

  if (isHistoryLoading && historyEpisodes.length === 0) {
    return (
      <div className="flex justify-center py-14">
        <LoadingSpinner />
      </div>
    );
  }

  if (historyEpisodes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <History className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t('podcast.noHistory')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
          {error}
        </div>
      )}
      {historyEpisodes.map((ep, i) => (
        <EpisodeRow
          key={ep.id}
          episode={ep}
          index={i + 1}
          isOpening={importingId === ep.id}
          onOpen={playCuratedEpisode}
        />
      ))}
    </div>
  );
}
