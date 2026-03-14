import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Trophy,
  Clock,
  Target,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Home,
  Star,
  Flame,
} from 'lucide-react';
import type { SessionSummary as SessionSummaryType, MilestoneProgress } from './types';

interface SessionSummaryProps {
  summary: SessionSummaryType;
  milestoneProgress?: MilestoneProgress | null;
  xpInfo?: { earned: number; total: number; level: number } | null;
  streakInfo?: { currentStreak: number; longestStreak: number } | null;
  onStartNew: () => void;
  onGoHome: () => void;
}

const getPerformanceMessage = (score: number) => {
  if (score >= 90) return { message: 'Excellent!', color: 'text-green-600', icon: Trophy };
  if (score >= 70) return { message: 'Great Job!', color: 'text-blue-600', icon: TrendingUp };
  if (score >= 50) return { message: 'Good Effort!', color: 'text-amber-600', icon: Target };
  return { message: 'Keep Practicing!', color: 'text-red-600', icon: TrendingDown };
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
};

const cefrColors: Record<string, string> = {
  A1: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  A2: 'bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-400',
  B1: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  B2: 'bg-blue-200 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400',
  C1: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  C2: 'bg-purple-200 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400',
};

export function SessionSummary({
  summary,
  milestoneProgress,
  xpInfo,
  streakInfo,
  onStartNew,
  onGoHome,
}: SessionSummaryProps) {
  const performance = getPerformanceMessage(summary.score_percent);
  const PerformanceIcon = performance.icon;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header card with score */}
      <Card className="overflow-hidden">
        <div
          className={cn(
            'p-6 text-center',
            summary.score_percent >= 70
              ? 'bg-green-50 dark:bg-green-900/10'
              : 'bg-amber-50 dark:bg-amber-900/10',
          )}
        >
          <PerformanceIcon className={cn('h-12 w-12 mx-auto mb-2', performance.color)} />
          <h2 className={cn('text-2xl font-bold', performance.color)}>{performance.message}</h2>
          <div className="text-5xl font-bold mt-2">{summary.score_percent}%</div>
          <p className="text-muted-foreground mt-1">
            {summary.questions_correct} of {summary.questions_answered} correct
          </p>

          {xpInfo && xpInfo.earned > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-2 mt-3 bg-[#C58C6E]/20 rounded-full border border-[#C58C6E]/30">
              <Star className="h-4 w-4 text-[#C58C6E]" />
              <span className="text-lg font-bold text-[#C58C6E]">+{xpInfo.earned} XP</span>
            </div>
          )}
        </div>

        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <div className="text-lg font-semibold">{formatTime(summary.total_time_seconds)}</div>
              <div className="text-xs text-muted-foreground">Time spent</div>
            </div>
            <div>
              <Target className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <div className="text-lg font-semibold">{summary.questions_answered}</div>
              <div className="text-xs text-muted-foreground">Questions</div>
            </div>
          </div>

          {(xpInfo || (streakInfo && streakInfo.currentStreak > 0)) && (
            <div className="flex items-center justify-center gap-3 p-3 bg-[#C58C6E]/10 rounded-lg border border-[#C58C6E]/20">
              {xpInfo && (
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-[#C58C6E]" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-[#C58C6E]">Level {xpInfo.level}</div>
                    <div className="text-xs text-muted-foreground">{xpInfo.total} total XP</div>
                  </div>
                </div>
              )}
              {streakInfo && streakInfo.currentStreak > 0 && (
                <div
                  className={cn(
                    'flex items-center gap-2',
                    xpInfo && 'pl-3 border-l border-[#C58C6E]/20',
                  )}
                >
                  <Flame className="h-4 w-4 text-[#C58C6E]" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-[#C58C6E]">
                      {streakInfo.currentStreak} day streak
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Best: {streakInfo.longestStreak} days
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CEFR Performance */}
      {summary.cefr_performance && Object.keys(summary.cefr_performance).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Performance by Level</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(summary.cefr_performance).map(([level, perf]) => {
              const accuracy =
                perf.answered > 0 ? Math.round((perf.correct / perf.answered) * 100) : 0;
              return (
                <div key={level} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge className={cn('text-xs', cefrColors[level])}>{level}</Badge>
                      <span className="text-muted-foreground">
                        {perf.correct}/{perf.answered} correct
                      </span>
                    </div>
                    <span className="font-medium">{accuracy}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${accuracy}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-2 gap-4">
        {summary.strong_areas?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Strong Areas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {summary.strong_areas.map((area) => (
                  <Badge key={area} variant="outline" className="bg-green-50 dark:bg-green-900/20">
                    {area.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {summary.weak_areas?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                <XCircle className="h-4 w-4" />
                Needs Practice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {summary.weak_areas.map((area) => (
                  <Badge key={area} variant="outline" className="bg-amber-50 dark:bg-amber-900/20">
                    {area.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Milestone progress */}
      {milestoneProgress && (
        <Card className={milestoneProgress.ready_for_test ? 'border-[#8BB7A3] bg-[#8BB7A3]/5' : ''}>
          <CardContent className="p-4">
            {milestoneProgress.ready_for_test ? (
              <div className="text-center space-y-2">
                <div className="text-2xl">&#x1f389;</div>
                <p className="font-semibold text-[#6B705C]">Ready for Level-Up Test!</p>
                <p className="text-sm text-muted-foreground">
                  {milestoneProgress.sessions} sessions completed with{' '}
                  {Math.round(milestoneProgress.accuracy * 100)}% accuracy
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#6B705C]">Learning Path Progress</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Sessions: {milestoneProgress.sessions}</span>
                  <span>Accuracy: {Math.round(milestoneProgress.accuracy * 100)}%</span>
                  <span>Vocabulary: {milestoneProgress.vocabulary}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onGoHome} className="flex-1">
          <Home className="h-4 w-4 mr-1" />
          Close
        </Button>
        <Button onClick={onStartNew} className="flex-1">
          <RotateCcw className="h-4 w-4 mr-1" />
          New Session
        </Button>
      </div>
    </div>
  );
}
