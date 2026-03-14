import { useEffect } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useDashboardStore } from '../stores/dashboardStore';
import { ErrorBanner } from './ErrorBanner';
import { SummaryCards } from './SummaryCards';
import { StatsChart } from './StatsChart';
import { GoalsCard } from './GoalsCard';
import { AchievementsCard } from './AchievementsCard';
import { ActivityFeed } from './ActivityFeed';

export function DashboardPage() {
  const { summary, isLoadingSummary, fetchSummary, checkAchievements } = useDashboardStore();

  useEffect(() => {
    fetchSummary();
    checkAchievements();
  }, [fetchSummary, checkAchievements]);

  if (isLoadingSummary && !summary) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <LayoutDashboard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Track your learning progress</p>
        </div>
      </div>

      <ErrorBanner />

      {/* Summary cards row */}
      <SummaryCards />

      {/* Chart */}
      <StatsChart />

      {/* Two-column layout: Goals + Achievements / Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <GoalsCard />
          <AchievementsCard />
        </div>
        <ActivityFeed />
      </div>
    </div>
  );
}
