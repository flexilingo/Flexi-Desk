import { useEffect } from 'react';
import { Flame, Zap } from 'lucide-react';
import * as Progress from '@radix-ui/react-progress';
import { useDashboardStore } from '../stores/dashboardStore';

export function GoalProgressBar() {
  const { xpProgress, fetchXPProgress } = useDashboardStore();

  useEffect(() => {
    fetchXPProgress();
  }, [fetchXPProgress]);

  if (!xpProgress) return null;

  const pct = Math.min(100, xpProgress.percentage);
  const isComplete = pct >= 100;

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-card/50">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Flame
          className={`h-3.5 w-3.5 ${isComplete ? 'text-success' : 'text-primary'}`}
        />
        <span>
          {xpProgress.xpToday}/{xpProgress.xpTarget} XP
        </span>
      </div>
      <Progress.Root className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <Progress.Indicator
          className={`h-full rounded-full transition-all duration-500 ${
            isComplete ? 'bg-success' : 'bg-primary'
          }`}
          style={{ width: `${pct}%` }}
        />
      </Progress.Root>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Zap className="h-3.5 w-3.5 text-accent" />
        <span>{xpProgress.streakCount} day streak</span>
        {xpProgress.freezeDaysRemaining > 0 && (
          <span className="text-primary/60">
            ({xpProgress.freezeDaysRemaining} freeze)
          </span>
        )}
      </div>
    </div>
  );
}
