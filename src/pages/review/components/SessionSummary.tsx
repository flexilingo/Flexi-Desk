import { CheckCircle, RotateCcw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SessionSummary as SummaryData } from '../types';

interface Props {
  summary: SummaryData;
  onReviewAgain: () => void;
  onBackToDecks: () => void;
}

export function SessionSummary({ summary, onReviewAgain, onBackToDecks }: Props) {
  const accuracy = Math.round(summary.accuracy * 100);
  const avgTime =
    summary.reviewedCards > 0 ? Math.round(summary.durationSeconds / summary.reviewedCards) : 0;

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle className="h-12 w-12 text-success" />
        <h2 className="text-2xl font-bold text-foreground">Session Complete!</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cards Reviewed</span>
            <span className="font-medium text-foreground">{summary.reviewedCards}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Accuracy</span>
            <span
              className={`font-medium ${
                accuracy >= 80 ? 'text-success' : accuracy >= 60 ? 'text-accent' : 'text-error'
              }`}
            >
              {accuracy}%
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Correct (Good/Easy)</span>
            <span className="font-medium text-success">{summary.correctCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Hard + Again</span>
            <span className="font-medium text-accent">
              {summary.hardCount + summary.againCount}
            </span>
          </div>
          <div className="my-2 h-px bg-border" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Time Spent</span>
            <span className="font-medium text-foreground">
              {formatDuration(summary.durationSeconds)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Avg per Card</span>
            <span className="font-medium text-foreground">{avgTime}s</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBackToDecks}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Decks
        </Button>
        <Button className="flex-1" onClick={onReviewAgain}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Review Again
        </Button>
      </div>
    </div>
  );
}
