import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PlayerView } from './PlayerView';

import { usePodcastStore } from '../stores/podcastStore';
import { useTranslation } from 'react-i18next';

/**
 * Route wrapper for `/podcast/player/:episodeId`.
 *
 * The player can now be entered cold — a reload, a back/forward, or the
 * mini-player's expand button — so the episode has to be hydrated from its id
 * rather than assumed to already be in the store.
 */
export function PlayerRoute() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();

  const activeEpisode = usePodcastStore((s) => s.activeEpisode);
  const loadEpisodeById = usePodcastStore((s) => s.loadEpisodeById);
  const clearEpisode = usePodcastStore((s) => s.clearEpisode);

  const [notFound, setNotFound] = useState(false);
  const { t } = useTranslation('podcastUi');
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!episodeId || hydratedFor.current === episodeId) return;
    hydratedFor.current = episodeId;
    setNotFound(false);
    loadEpisodeById(episodeId).then((ep) => {
      if (!ep) setNotFound(true);
    });
  }, [episodeId, loadEpisodeById]);

  // Drop the per-episode session state (transcript, analysis) when leaving.
  useEffect(() => () => clearEpisode(), [clearEpisode]);

  if (notFound) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t('playerRoute.loadFailed')}</p>
        <button
          type="button"
          onClick={() => navigate('/podcast')}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {t('playerRoute.backToPodcasts')}
        </button>
      </div>
    );
  }

  if (!activeEpisode || activeEpisode.id !== episodeId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <PlayerView />
    </div>
  );
}
