import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MiniPlayer } from '@/pages/podcast/components/MiniPlayer';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';

import { useJobEvents } from '@/hooks/useJobEvents';
import { JobToastStack } from '@/components/job/JobToastStack';

export function Shell() {
  useJobEvents();
  const currentEpisode = usePlayerStore((s) => s.currentEpisode);
  const { pathname } = useLocation();

  // Hide the mini player while the full player route is open.
  const fillsPage = pathname.startsWith('/reader/pdf/');
  const showMiniPlayer = currentEpisode && !pathname.startsWith('/podcast/player/');

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header />
        {fillsPage ? (
          // The PDF reader owns its own scrolling (pages, side panels), so it gets the
          // whole area instead of a padded scroll column.
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
        ) : (
          <ScrollArea className="flex-1">
            <main className="p-6 min-w-0 max-w-full">
              <Outlet />
            </main>
          </ScrollArea>
        )}
      </div>
      {showMiniPlayer && <MiniPlayer />}
      <JobToastStack />
    </div>
  );
}
