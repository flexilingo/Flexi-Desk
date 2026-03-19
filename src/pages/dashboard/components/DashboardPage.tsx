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
import { TodaySummary } from './TodaySummary';
import { StreakCalendar } from './StreakCalendar';
import { XPChart } from './XPChart';
import { CEFRRadar } from './CEFRRadar';
import { StudyHeatmap } from './StudyHeatmap';
import { VocabTimeline } from './VocabTimeline';

export function DashboardPage() {
  const {
    summary,
    isLoadingSummary,
    fetchSummary,
    checkAchievements,
    fetchAnalytics,
    analyticsSummary,
    xpHistory,
    cefrRadar,
    studyHeatmap,
    vocabGrowth,
    streakCalendar,
  } = useDashboardStore();

  useEffect(() => {
    fetchSummary();
    checkAchievements();
    fetchAnalytics();
  }, [fetchSummary, checkAchievements, fetchAnalytics]);

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

      {/* Today's summary strip */}
      <TodaySummary data={analyticsSummary} />

      {/* Summary cards row */}
      <SummaryCards />

      {/* Streak calendar (full width) */}
      <StreakCalendar data={streakCalendar} />

      {/* Two-column: XP Chart + CEFR Radar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <XPChart data={xpHistory} />
        <CEFRRadar data={cefrRadar} />
      </div>

      {/* Two-column: Study Heatmap + Vocab Timeline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StudyHeatmap data={studyHeatmap} />
        <VocabTimeline data={vocabGrowth} />
      </div>

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
