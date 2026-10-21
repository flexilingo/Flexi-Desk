import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { usePodcastStore } from '../stores/podcastStore';
import { DiscoverView } from './discover/DiscoverView';
import { BrowseSectionView } from './discover/BrowseSectionView';
import { LibraryView } from './library/LibraryView';
import { EpisodeListView } from './EpisodeListView';
import { PodcastDetailView } from './detail/PodcastDetailView';
import { PlayerRoute } from './PlayerRoute';
import { ErrorBanner } from './ErrorBanner';

/**
 * Podcast routes. Navigation used to be a `view` state machine inside
 * `podcastStore`, so nothing was deep-linkable and the mini-player had no URL to
 * expand to. It's real routing now; the store only holds data.
 */
export function PodcastPage() {
  const fetchFeeds = usePodcastStore((s) => s.fetchFeeds);

  useEffect(() => {
    fetchFeeds();
  }, [fetchFeeds]);

  return (
    <Routes>
      {/* The player is a fixed fullscreen surface, so it renders outside the
          padded hub wrapper below. */}
      <Route path="player/:episodeId" element={<PlayerRoute />} />

      <Route
        path="*"
        element={
          <div className="min-w-0 max-w-full space-y-4">
            <ErrorBanner />
            <Routes>
              <Route index element={<DiscoverView />} />
              <Route path="library" element={<LibraryView />} />
              <Route path="browse/:section" element={<BrowseSectionView />} />
              <Route path="feed/:feedId" element={<EpisodeListView />} />
              {/* `show/:feedId` = a CLOUD podcast (PodcastIndex feed id).
                  `feed/:feedId` = a LOCAL subscribed feed (SQLite row id). */}
              <Route path="show/:feedId" element={<PodcastDetailView />} />
            </Routes>
          </div>
        }
      />
    </Routes>
  );
}
