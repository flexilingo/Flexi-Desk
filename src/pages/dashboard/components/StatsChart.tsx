import { useEffect, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useDashboardStore } from '../stores/dashboardStore';

export function StatsChart() {
  const { statsHistory, isLoadingStats, fetchDailyStats } = useDashboardStore();

  useEffect(() => {
    // Fetch last 30 days
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    fetchDailyStats(from.toISOString().split('T')[0], now.toISOString().split('T')[0]);
  }, [fetchDailyStats]);

  // Fill missing days with zeros
  const chartData = useMemo(() => {
    const now = new Date();
    const days: { date: string; minutes: number; words: number; reviews: number }[] = [];
    const statsMap = new Map(statsHistory.map((s) => [s.date, s]));

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const stat = statsMap.get(dateStr);
      days.push({
        date: dateStr,
        minutes: stat?.studyMinutes ?? 0,
        words: stat?.wordsLearned ?? 0,
        reviews: stat?.reviewsCompleted ?? 0,
      });
    }
    return days;
  }, [statsHistory]);

  const maxMinutes = Math.max(...chartData.map((d) => d.minutes), 1);

  if (isLoadingStats) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Loading stats...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Study Activity (30 days)</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* Simple bar chart */}
        <div className="flex items-end gap-[2px] h-32">
          {chartData.map((day) => {
            const height = maxMinutes > 0 ? (day.minutes / maxMinutes) * 100 : 0;
            const isToday = day.date === new Date().toISOString().split('T')[0];
            return (
              <div
                key={day.date}
                className="group relative flex-1"
                title={`${day.date}: ${day.minutes}min, ${day.words} words, ${day.reviews} reviews`}
              >
                <div
                  className={`w-full rounded-t-sm transition-colors ${
                    isToday ? 'bg-primary' : day.minutes > 0 ? 'bg-[#8BB7A3]' : 'bg-muted'
                  } ${day.minutes > 0 ? 'min-h-[4px]' : 'h-[2px]'}`}
                  style={{ height: `${Math.max(height, 2)}%` }}
                />
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                  <div className="rounded-md bg-foreground px-2 py-1 text-[10px] text-background whitespace-nowrap">
                    {new Date(day.date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                    <br />
                    {day.minutes}min
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>
            {new Date(chartData[0]?.date).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
          <span>Today</span>
        </div>

        {/* Summary below chart */}
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-sm bg-[#8BB7A3]" />
            <span>Study time</span>
          </div>
          <span>Total: {chartData.reduce((sum, d) => sum + d.minutes, 0)} min</span>
          <span>
            Avg: {Math.round(chartData.reduce((sum, d) => sum + d.minutes, 0) / 30)} min/day
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
