import { useEffect } from 'react';
import {
  Activity,
  BookOpen,
  PenLine,
  GraduationCap,
  Headphones,
  RotateCcw,
  Mic,
  Subtitles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useDashboardStore } from '../stores/dashboardStore';
import type { ActivityEntry } from '../types';

const MODULE_ICONS: Record<string, typeof Activity> = {
  srs: RotateCcw,
  reading: BookOpen,
  writing: PenLine,
  exam: GraduationCap,
  podcast: Headphones,
  pronunciation: Mic,
  caption: Subtitles,
};

export function ActivityFeed() {
  const { activities, fetchActivity } = useDashboardStore();

  useEffect(() => {
    fetchActivity(20);
  }, [fetchActivity]);

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-center text-xs text-muted-foreground py-4">
            Your activity will appear here as you study.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {activities.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const Icon = MODULE_ICONS[entry.module] ?? Activity;
  const timeStr = new Date(entry.createdAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateStr = new Date(entry.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/30 transition-colors">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground truncate">
          {entry.description ?? entry.activityType}
        </p>
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        {dateStr} {timeStr}
      </span>
    </div>
  );
}
