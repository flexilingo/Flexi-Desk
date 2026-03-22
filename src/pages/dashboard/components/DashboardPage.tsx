import { useEffect } from 'react';
import { LayoutDashboard, Podcast, BookOpen, Brain } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardStore } from '../stores/dashboardStore';
import { ErrorBanner } from './ErrorBanner';
import { SummaryCards } from './SummaryCards';
import { TodaySummary } from './TodaySummary';
import { StreakCalendar } from './StreakCalendar';
import { ActivityFeed } from './ActivityFeed';

export function DashboardPage() {
  const {
    summary,
    isLoadingSummary,
    fetchSummary,
    fetchAnalytics,
    analyticsSummary,
    streakCalendar,
  } = useDashboardStore();

  useEffect(() => {
    fetchSummary();
    fetchAnalytics();
  }, [fetchSummary, fetchAnalytics]);

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

      {/* Welcome card for new users */}
      {summary && summary.totalWords === 0 && summary.totalReviews === 0 && (
        <WelcomeCard />
      )}

      {/* Today's summary strip */}
      <TodaySummary data={analyticsSummary} />

      {/* Summary cards row */}
      <SummaryCards />

      {/* Streak calendar (full width) */}
      <StreakCalendar data={streakCalendar} />

      {/* Activity feed */}
      <ActivityFeed />
    </div>
  );
}

function WelcomeCard() {
  const navigate = useNavigate();

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Welcome to FlexiDesk!</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Start learning by adding a podcast. Listen to real content, click any word to get instant AI translation, and review your vocabulary with flashcards.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => navigate('/podcast')} className="gap-2">
            <Podcast className="h-4 w-4" />
            Add a Podcast
          </Button>
          <Button variant="outline" onClick={() => navigate('/review')} className="gap-2">
            <Brain className="h-4 w-4" />
            Create Flashcards
          </Button>
          <Button variant="outline" onClick={() => navigate('/settings')} className="gap-2">
            <BookOpen className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
