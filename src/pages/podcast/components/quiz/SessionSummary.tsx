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
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

interface SessionSummaryProps {
  summary: SessionSummaryType;
  milestoneProgress?: MilestoneProgress | null;
  xpInfo?: { earned: number; total: number; level: number } | null;
  streakInfo?: { currentStreak: number; longestStreak: number } | null;
  onStartNew: () => void;
  onGoHome: () => void;
}

const getPerformanceMessage = (score: number) => {
  if (score >= 90)
    return { message: 'quiz.summary.excellent', color: 'text-success', icon: Trophy };
  if (score >= 70)
    return { message: 'quiz.summary.great', color: 'text-primary', icon: TrendingUp };
  if (score >= 50) return { message: 'quiz.summary.good', color: 'text-warning', icon: Target };
  return { message: 'quiz.summary.keepPracticing', color: 'text-error', icon: TrendingDown };
};

const formatTime = (seconds: number, t: TFunction) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return t('shared.secondsShort', { value: secs });
  return t('shared.durMS', { m: mins, s: secs });
};

const cefrColors: Record<string, string> = {
  A1: 'bg-cefr-a1/15 text-cefr-a1',
  A2: 'bg-cefr-a2/15 text-cefr-a2',
  B1: 'bg-cefr-b1/15 text-cefr-b1',
  B2: 'bg-cefr-b2/15 text-cefr-b2',
  C1: 'bg-cefr-c1/15 text-cefr-c1',
  C2: 'bg-cefr-c2/15 text-cefr-c2',
};

export function SessionSummary({
  summary,
  milestoneProgress,
  xpInfo,
  streakInfo,
  onStartNew,
  onGoHome,
}: SessionSummaryProps) {
  const { t } = useTranslation('podcastUi');
  const performance = getPerformanceMessage(summary.score_percent);
  const PerformanceIcon = performance.icon;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header card with score */}
      <Card className="overflow-hidden">
        <div
          className={cn(
            'p-6 text-center',
            summary.score_percent >= 70 ? 'bg-success/10' : 'bg-warning/10',
          )}
        >
          <PerformanceIcon className={cn('h-12 w-12 mx-auto mb-2', performance.color)} />
          <h2 className={cn('text-2xl font-bold', performance.color)}>{t(performance.message)}</h2>
          <div className="text-5xl font-bold mt-2">{summary.score_percent}%</div>
          <p className="text-muted-foreground mt-1">
            {t('quiz.summary.correctOf', {
              correct: summary.questions_correct,
              answered: summary.questions_answered,
            })}
          </p>

          {xpInfo && xpInfo.earned > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-2 mt-3 bg-warning/20 rounded-full border border-warning/30">
              <Star className="h-4 w-4 text-warning" />
              <span className="text-lg font-bold text-warning">
                {t('xpToast.earned', { earned: xpInfo.earned })}
              </span>
            </div>
          )}
        </div>

        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <div className="text-lg font-semibold">
                {formatTime(summary.total_time_seconds, t)}
              </div>
              <div className="text-xs text-muted-foreground">{t('quiz.summary.timeSpent')}</div>
            </div>
            <div>
              <Target className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <div className="text-lg font-semibold">{summary.questions_answered}</div>
              <div className="text-xs text-muted-foreground">{t('quiz.summary.questions')}</div>
            </div>
          </div>

          {(xpInfo || (streakInfo && streakInfo.currentStreak > 0)) && (
            <div className="flex items-center justify-center gap-3 p-3 bg-warning/10 rounded-lg border border-warning/20">
              {xpInfo && (
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-warning" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-warning">
                      {t('quiz.summary.levelNumber', { level: xpInfo.level })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('quiz.summary.totalXp', { total: xpInfo.total })}
                    </div>
                  </div>
                </div>
              )}
              {streakInfo && streakInfo.currentStreak > 0 && (
                <div
                  className={cn(
                    'flex items-center gap-2',
                    xpInfo && 'pl-3 border-l border-warning/20',
                  )}
                >
                  <Flame className="h-4 w-4 text-warning" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-warning">
                      {t('quiz.summary.dayStreak', { count: streakInfo.currentStreak })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('quiz.summary.bestStreak', { count: streakInfo.longestStreak })}
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
            <CardTitle className="text-base">{t('quiz.summary.performanceByLevel')}</CardTitle>
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
                        {t('quiz.summary.correctFraction', {
                          correct: perf.correct,
                          answered: perf.answered,
                        })}
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
              <CardTitle className="text-base flex items-center gap-2 text-success">
                <CheckCircle2 className="h-4 w-4" />
                {t('quiz.summary.strongAreas')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {summary.strong_areas.map((area) => (
                  <Badge key={area} variant="outline" className="bg-success/10">
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
              <CardTitle className="text-base flex items-center gap-2 text-warning">
                <XCircle className="h-4 w-4" />
                {t('quiz.summary.needsPractice')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {summary.weak_areas.map((area) => (
                  <Badge key={area} variant="outline" className="bg-warning/10">
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
        <Card className={milestoneProgress.ready_for_test ? 'border-success bg-success/5' : ''}>
          <CardContent className="p-4">
            {milestoneProgress.ready_for_test ? (
              <div className="text-center space-y-2">
                <div className="text-2xl">&#x1f389;</div>
                <p className="font-semibold text-muted-foreground">
                  {t('quiz.summary.readyForTest')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('quiz.summary.sessionsCompleted', {
                    count: milestoneProgress.sessions,
                    accuracy: Math.round(milestoneProgress.accuracy * 100),
                  })}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {t('quiz.summary.learningPath')}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    {t('quiz.summary.sessionsLabel', { value: milestoneProgress.sessions })}
                  </span>
                  <span>
                    {t('quiz.summary.accuracyLabel', {
                      value: Math.round(milestoneProgress.accuracy * 100),
                    })}
                  </span>
                  <span>
                    {t('quiz.summary.vocabularyLabel', { value: milestoneProgress.vocabulary })}
                  </span>
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
          {t('shared.close')}
        </Button>
        <Button onClick={onStartNew} className="flex-1">
          <RotateCcw className="h-4 w-4 mr-1" />
          {t('quiz.summary.newSession')}
        </Button>
      </div>
    </div>
  );
}
