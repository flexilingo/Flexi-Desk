import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MiniPlayer } from '@/pages/podcast/components/MiniPlayer';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { usePodcastStore } from '@/pages/podcast/stores/podcastStore';

import { useJobEvents } from '@/hooks/useJobEvents';
import { JobToastStack } from '@/components/job/JobToastStack';

export function Shell() {

  useJobEvents();
  const currentEpisode = usePlayerStore((s) => s.currentEpisode);
  const view = usePodcastStore((s) => s.view);

  const showMiniPlayer = currentEpisode && view !== 'player';

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header />
        <ScrollArea className="flex-1">
          <main className="p-6 min-w-0 max-w-full">
            <Outlet />
          </main>
        </ScrollArea>
      </div>
      {showMiniPlayer && <MiniPlayer />}
      <JobToastStack />
    </div>
  );
}
