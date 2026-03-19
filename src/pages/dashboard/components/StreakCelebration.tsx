import { useEffect, useState } from 'react';
import { Trophy, X } from 'lucide-react';
import { useDashboardStore } from '../stores/dashboardStore';

const MILESTONES: Record<number, string> = {
  7: '1 Week Streak!',
  30: '1 Month Streak!',
  100: '100 Day Streak!',
  365: '1 Year Streak!',
};

export function StreakCelebration() {
  const { xpProgress } = useDashboardStore();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!xpProgress) return;
    const streak = xpProgress.streakCount;
    const milestone = MILESTONES[streak];
    if (milestone && !dismissed.has(streak)) {
      setMessage(milestone);
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setDismissed((prev) => new Set(prev).add(streak));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [xpProgress?.streakCount, dismissed]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-card px-4 py-3 shadow-lg">
        <Trophy className="h-5 w-5 text-success" />
        <span className="text-sm font-medium text-foreground">{message}</span>
        <button
          onClick={() => setVisible(false)}
          className="ml-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
