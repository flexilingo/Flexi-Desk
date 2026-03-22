import { PartyPopper, RotateCcw, ArrowLeft, TrendingUp, TrendingDown, Star, BookOpen, RefreshCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useReviewStore } from '../stores/reviewStore';
import type { SessionSummary as SummaryData, SRSSessionStats } from '../types';

interface Props {
  summary: SummaryData;
  onReviewAgain: () => void;
  onBackToDecks: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function getEncouragement(accuracy: number): string {
  if (accuracy >= 90) return 'Excellent! Keep it up!';
  if (accuracy >= 70) return 'Great job! You\'re making progress.';
  if (accuracy >= 50) return 'Keep going — practice makes perfect!';
  return 'Don\'t give up — every review helps!';
}

export function SessionSummary({ summary, onReviewAgain, onBackToDecks }: Props) {
  const accuracy = Math.round(summary.accuracy * 100);
  const incorrectCount = summary.reviewedCards - summary.correctCount;
  const sessionSRSStats = useReviewStore((s) => s.sessionSRSStats);

  const hasStats =
    sessionSRSStats.boxPromotions > 0 ||
    sessionSRSStats.boxDemotions > 0 ||
    sessionSRSStats.newlyMastered > 0 ||
    sessionSRSStats.newCardsLearned > 0 ||
    sessionSRSStats.dueCardsReviewed > 0;

  return (
    <div className="flex items-center justify-center min-h-full p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="py-8 px-6">
            {/* Icon + Title */}
            <div className="text-center mb-6">
              <PartyPopper className="w-14 h-14 mx-auto text-primary mb-4" />
              <h2 className="text-2xl font-bold text-foreground">Session Complete!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                You've finished this review session
              </p>
            </div>

            {/* 3-column stat boxes */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-muted rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{summary.reviewedCards}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cards</p>
              </div>
              <div className="bg-[#8BB7A3]/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-[#8BB7A3]">{summary.correctCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Correct</p>
              </div>
              <div className="bg-destructive/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{incorrectCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Incorrect</p>
              </div>
            </div>

            {/* Accuracy bar */}
            <div className="mb-6">
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    accuracy >= 70
                      ? 'bg-[#8BB7A3]'
                      : accuracy >= 40
                      ? 'bg-[#C58C6E]'
                      : 'bg-destructive'
                  }`}
                  style={{ width: `${accuracy}%` }}
                />
              </div>
              <p className="text-xl font-bold text-center mt-2">{accuracy}%</p>
              <p className="text-sm text-muted-foreground text-center mt-0.5">
                {getEncouragement(accuracy)}
              </p>
            </div>

            {/* SRS Progress */}
            {hasStats && (
              <div className="bg-muted rounded-xl p-4 mb-6">
                <p className="text-sm font-semibold text-foreground mb-3">SRS Progress</p>
                <div className="space-y-2">
                  {sessionSRSStats.dueCardsReviewed > 0 && (
                    <SRSStat icon={<RefreshCcw className="w-4 h-4 text-[#6B705C]" />} count={sessionSRSStats.dueCardsReviewed} label="due cards reviewed" color="text-[#6B705C]" />
                  )}
                  {sessionSRSStats.newCardsLearned > 0 && (
                    <SRSStat icon={<BookOpen className="w-4 h-4 text-[#8BB7A3]" />} count={sessionSRSStats.newCardsLearned} label="new cards learned" color="text-[#8BB7A3]" />
                  )}
                  {sessionSRSStats.boxPromotions > 0 && (
                    <SRSStat icon={<TrendingUp className="w-4 h-4 text-[#8BB7A3]" />} count={sessionSRSStats.boxPromotions} label="cards promoted" color="text-[#8BB7A3]" />
                  )}
                  {sessionSRSStats.boxDemotions > 0 && (
                    <SRSStat icon={<TrendingDown className="w-4 h-4 text-[#C58C6E]" />} count={sessionSRSStats.boxDemotions} label="cards demoted" color="text-[#C58C6E]" />
                  )}
                  {sessionSRSStats.newlyMastered > 0 && (
                    <SRSStat icon={<Star className="w-4 h-4 text-amber-500" />} count={sessionSRSStats.newlyMastered} label="cards mastered" color="text-amber-500" />
                  )}
                </div>
              </div>
            )}

            {/* Secondary stats */}
            <div className="text-xs text-muted-foreground text-center mb-6">
              Time: {formatDuration(summary.durationSeconds)} ·{' '}
              {summary.reviewedCards > 0
                ? Math.round(summary.durationSeconds / summary.reviewedCards)
                : 0}
              s per card
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <button
                onClick={onReviewAgain}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow"
              >
                <RotateCcw className="w-4 h-4" />
                Review Again
              </button>

              {incorrectCount > 0 && (
                <button
                  onClick={onReviewAgain}
                  className="w-full bg-accent hover:bg-accent/90 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Review Mistakes ({incorrectCount})
                </button>
              )}

              <button
                onClick={onBackToDecks}
                className="w-full bg-muted hover:bg-muted/80 text-foreground px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Decks
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SRSStat({ icon, count, label, color }: { icon: React.ReactNode; count: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      <span className="text-muted-foreground">
        <span className={`font-semibold ${color}`}>{count}</span> {label}
      </span>
    </div>
  );
}
