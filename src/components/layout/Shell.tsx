import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MiniPlayer } from '@/pages/podcast/components/MiniPlayer';
import { GoalProgressBar } from '@/pages/dashboard/components/GoalProgressBar';
import { StreakCelebration } from '@/pages/dashboard/components/StreakCelebration';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { usePodcastStore } from '@/pages/podcast/stores/podcastStore';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useJobEvents } from '@/hooks/useJobEvents';
import { JobToastStack } from '@/components/job/JobToastStack';

export function Shell() {
  useShortcuts();
  useJobEvents();
  const currentEpisode = usePlayerStore((s) => s.currentEpisode);
  const view = usePodcastStore((s) => s.view);

  // MiniPlayer is floating (fixed bottom-right), shown when playing but NOT in full player view
  const showMiniPlayer = currentEpisode && view !== 'player';

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <GoalProgressBar />
        <ScrollArea className="flex-1">
          <main className="p-6">
            <Outlet />
          </main>
        </ScrollArea>
      </div>
      {showMiniPlayer && <MiniPlayer />}
      <StreakCelebration />
      <JobToastStack />
    </div>
  );
}
