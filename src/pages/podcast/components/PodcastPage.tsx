import { useEffect } from 'react';
import { usePodcastStore } from '../stores/podcastStore';
import { DiscoverView } from './discover/DiscoverView';
import { EpisodeListView } from './EpisodeListView';
import { SearchView } from './SearchView';
import { PlayerView } from './PlayerView';
import { ErrorBanner } from './ErrorBanner';

export function PodcastPage() {
  const { view, fetchFeeds } = usePodcastStore();

  useEffect(() => {
    fetchFeeds();
  }, [fetchFeeds]);

  // PlayerView renders as a fixed fullscreen overlay — independent of parent layout
  if (view === 'player') {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <PlayerView />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ErrorBanner />
      {view === 'feeds' && <DiscoverView />}
      {view === 'episodes' && <EpisodeListView />}
      {view === 'search' && <SearchView />}
    </div>
  );
}
