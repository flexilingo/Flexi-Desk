import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  submittingRating: number | null;
  onRatingSubmit: (rating: 1 | 2 | 3 | 4 | 5) => void;
  /** Formatted next-review interval per rating, e.g. { 1: '1d', 4: '2w' }. */
  predictedIntervals: Record<number, string>;
}

// 1-5 confidence, tinted with desk's semantic tokens.
const RATING_CLS: Record<number, string> = {
  1: 'border-error/40 text-error hover:bg-error/10',
  2: 'border-warning/40 text-warning hover:bg-warning/10',
  3: 'border-primary/40 text-primary hover:bg-primary/10',
  4: 'border-success/40 text-success hover:bg-success/10',
  5: 'border-success/60 bg-success/10 text-success hover:bg-success/20',
};

const RATING_KEY: Record<number, string> = {
  1: 'again',
  2: 'hard',
  3: 'good',
  4: 'easy',
  5: 'perfect',
};

/**
 * The 1-5 self-rating row: predicted next-review interval on top, label below.
 * Intervals are display-only — Rust recomputes the real schedule on submit.
 */
export function RatingButtons({ submittingRating, onRatingSubmit, predictedIntervals }: Props) {
  const { t } = useTranslation('study');

  return (
    <div className="mx-auto grid w-full max-w-[640px] grid-cols-5 gap-2">
      {([1, 2, 3, 4, 5] as const).map((rating) => (
        <button
          key={rating}
          type="button"
          disabled={submittingRating !== null}
          onClick={() => onRatingSubmit(rating)}
          title={`${rating}: ${t(`runner.${RATING_KEY[rating]}`)}`}
          className={cn(
            'flex flex-col items-center gap-1 rounded-lg border-[1.5px] bg-card px-1 py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed',
            RATING_CLS[rating],
          )}
        >
          {submittingRating === rating ? (
            <div className="flex h-8 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </div>
          ) : (
            <>
              <span className="font-mono text-[13px] font-bold leading-none tabular-nums opacity-80">
                {predictedIntervals[rating] ?? '—'}
              </span>
              <span className="text-center text-[13px] font-bold leading-tight">
                {t(`runner.${RATING_KEY[rating]}`)}
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
