import { Trophy, Lock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDashboardStore } from '../stores/dashboardStore';
import { ACHIEVEMENT_CATEGORY_LABELS } from '../types';
import type { Achievement } from '../types';

export function AchievementsCard() {
  const { summary } = useDashboardStore();
  const achievements = summary?.recentAchievements ?? [];

  if (achievements.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[#C58C6E]" />
            <CardTitle className="text-base">Achievements</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-center text-xs text-muted-foreground py-4">
            Keep studying to unlock achievements!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[#C58C6E]" />
          <CardTitle className="text-base">Recent Achievements</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {achievements.map((ach) => (
          <AchievementRow key={ach.id} achievement={ach} />
        ))}
      </CardContent>
    </Card>
  );
}

function AchievementRow({ achievement }: { achievement: Achievement }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg p-2 ${achievement.isUnlocked ? 'bg-[#C58C6E]/5' : 'bg-muted/30'}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          achievement.isUnlocked ? 'bg-[#C58C6E]/20' : 'bg-muted'
        }`}
      >
        {achievement.isUnlocked ? (
          <Trophy className="h-4 w-4 text-[#C58C6E]" />
        ) : (
          <Lock className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium ${achievement.isUnlocked ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {achievement.title}
        </p>
        {achievement.description && (
          <p className="text-xs text-muted-foreground truncate">{achievement.description}</p>
        )}
      </div>
      <Badge variant="secondary" className="text-xs">
        {ACHIEVEMENT_CATEGORY_LABELS[achievement.category]}
      </Badge>
    </div>
  );
}
