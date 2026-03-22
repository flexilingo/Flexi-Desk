import { useEffect } from 'react';
import { usePodcastStore } from '../stores/podcastStore';
import { useDiscoverStore } from '../stores/discoverStore';
import { DiscoverView } from './discover/DiscoverView';
import { BrowseSectionView } from './discover/BrowseSectionView';
import { EpisodeListView } from './EpisodeListView';
import { PlayerView } from './PlayerView';
import { ErrorBanner } from './ErrorBanner';

export function PodcastPage() {
  const { view, fetchFeeds } = usePodcastStore();
  const browseSectionSlug = useDiscoverStore((s) => s.browseSectionSlug);

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
    <div className="space-y-4 min-w-0 max-w-full">
      <ErrorBanner />
      {view === 'feeds' && (browseSectionSlug ? <BrowseSectionView /> : <DiscoverView />)}
      {view === 'episodes' && <EpisodeListView />}
    </div>
  );
}
