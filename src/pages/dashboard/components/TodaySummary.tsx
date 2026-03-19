import { Flame, Zap, BookOpen, Clock, RotateCcw } from 'lucide-react';
import type { AnalyticsSummary } from '../types';
import { formatStudyTime } from '../types';

interface Props {
  data: AnalyticsSummary | null;
}

export function TodaySummary({ data }: Props) {
  if (!data) return null;

  const metrics = [
    { icon: Flame, label: 'XP Today', value: String(data.xpToday), color: 'text-accent' },
    { icon: Zap, label: 'Streak', value: `${data.streakCount} days`, color: 'text-primary' },
    { icon: BookOpen, label: 'Words', value: String(data.wordsLearnedToday), color: 'text-success' },
    { icon: Clock, label: 'Study Time', value: formatStudyTime(data.studyMinutesToday), color: 'text-primary' },
    { icon: RotateCcw, label: 'Reviews', value: String(data.reviewsToday), color: 'text-accent' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <m.icon className={`h-4 w-4 ${m.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground">{m.value}</p>
            <p className="truncate text-xs text-muted-foreground">{m.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
