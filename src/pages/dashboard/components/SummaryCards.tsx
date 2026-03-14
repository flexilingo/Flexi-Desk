import { Flame, BookOpen, Clock, RotateCcw, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardStore } from '../stores/dashboardStore';
import { formatStudyTime } from '../types';

export function SummaryCards() {
  const { summary } = useDashboardStore();

  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {/* Streak */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C58C6E]/10">
            <Flame className="h-5 w-5 text-[#C58C6E]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{summary.streak.currentStreak}</p>
            <p className="text-xs text-muted-foreground">Day Streak</p>
          </div>
        </CardContent>
      </Card>

      {/* Today's study time */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">
              {formatStudyTime(summary.today.studyMinutes)}
            </p>
            <p className="text-xs text-muted-foreground">Today</p>
          </div>
        </CardContent>
      </Card>

      {/* Vocabulary */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#8BB7A3]/10">
            <BookOpen className="h-5 w-5 text-[#8BB7A3]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{summary.totalVocabulary}</p>
            <p className="text-xs text-muted-foreground">Words</p>
          </div>
        </CardContent>
      </Card>

      {/* Reviews */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <RotateCcw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{summary.today.reviewsCompleted}</p>
            <p className="text-xs text-muted-foreground">Reviews Today</p>
          </div>
        </CardContent>
      </Card>

      {/* Longest streak */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C58C6E]/10">
            <Trophy className="h-5 w-5 text-[#C58C6E]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{summary.streak.longestStreak}</p>
            <p className="text-xs text-muted-foreground">Best Streak</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
