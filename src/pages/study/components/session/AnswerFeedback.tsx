import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  isCorrect: boolean;
  /** The expected answer, shown when the learner got it wrong. */
  expected?: string;
  /** A miss that was one accent or one letter away says so — the grade itself stays a miss. */
  nearMiss?: 'accent' | 'typo' | null;
}

/** Shared correct / not-quite banner used by the graded activities. */
export function AnswerFeedback({ isCorrect, expected, nearMiss }: Props) {
  const { t } = useTranslation('study');
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm',
          isCorrect
            ? 'border-success/50 bg-success/10 text-success'
            : 'border-error/50 bg-error/10 text-error',
        )}
      >
        {isCorrect ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
        <span className="font-medium">
          {isCorrect ? t('runner.correct') : t('runner.incorrect')}
        </span>
        {!isCorrect && expected && (
          <span className="ms-1 text-foreground">
            {t('runner.answer')}: <span className="font-semibold">{expected}</span>
          </span>
        )}
      </div>
      {!isCorrect && nearMiss && (
        <p className="text-center text-[13px] font-semibold text-warning" data-testid="near-miss">
          {t(nearMiss === 'accent' ? 'runner.nearAccent' : 'runner.nearTypo')}
        </p>
      )}
    </div>
  );
}
