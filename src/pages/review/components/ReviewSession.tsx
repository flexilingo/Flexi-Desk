import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReviewStore } from '../stores/reviewStore';
import { useReviewKeyboard } from '../hooks/useReviewKeyboard';
import { CardFlip } from './CardFlip';
import { createStrategy } from '../algorithms';
import type { Rating } from '../types';

const RATINGS: { key: Rating; label: string; shortcut: string; className: string }[] = [
  {
    key: 'again',
    label: 'Again',
    shortcut: '1',
    className: 'border-error text-error hover:bg-error/10',
  },
  {
    key: 'hard',
    label: 'Hard',
    shortcut: '2',
    className: 'border-accent text-accent hover:bg-accent/10',
  },
  {
    key: 'good',
    label: 'Good',
    shortcut: '3',
    className: 'border-success text-success hover:bg-success/10',
  },
  {
    key: 'easy',
    label: 'Easy',
    shortcut: '4',
    className: 'border-primary text-primary hover:bg-primary/10',
  },
];

export function ReviewSession() {
  const {
    session,
    currentCard,
    isFlipped,
    cardsRemaining,
    isRating,
    flipCard,
    rateCard,
    completeSession,
  } = useReviewStore();

  useReviewKeyboard();

  if (!session || !currentCard) return null;

  const progress = session.totalCards > 0 ? (session.currentIndex / session.totalCards) * 100 : 0;

  // Preview intervals
  const strategy = createStrategy(session.algorithm);
  const previews = RATINGS.reduce(
    (acc, r) => {
      const result = strategy.schedule(
        {
          cardId: currentCard.id,
          boxNumber: currentCard.boxNumber,
          easinessFactor: currentCard.easinessFactor,
          repetitions: undefined,
          stability: currentCard.stability,
          difficulty: currentCard.difficulty,
          state: currentCard.state,
          intervalDays: currentCard.intervalDays,
        },
        r.key,
      );
      acc[r.key] = result.intervalDays;
      return acc;
    },
    {} as Record<Rating, number>,
  );

  function formatInterval(days: number): string {
    if (days < 1) return '<1d';
    if (days === 1) return '1d';
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.round(days / 30)}mo`;
    return `${(days / 365).toFixed(1)}y`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {session.currentIndex + 1} / {session.totalCards} · {cardsRemaining} remaining
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm('End this session?')) completeSession();
          }}
        >
          <X className="mr-1 h-4 w-4" />
          End
        </Button>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Card */}
      <CardFlip card={currentCard} isFlipped={isFlipped} onFlip={flipCard} />

      {/* Rating buttons */}
      {isFlipped && (
        <div className="flex justify-center gap-3">
          {RATINGS.map((r) => (
            <button
              key={r.key}
              disabled={isRating}
              onClick={() => rateCard(r.key)}
              className={`flex min-w-[80px] flex-col items-center gap-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50 ${r.className}`}
            >
              <span>{r.label}</span>
              <span className="text-xs opacity-60">{formatInterval(previews[r.key])}</span>
              <span className="text-[10px] opacity-40">[{r.shortcut}]</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
