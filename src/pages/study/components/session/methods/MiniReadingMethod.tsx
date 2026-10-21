import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnswerFeedback } from '../AnswerFeedback';
import { ClickableText } from '../ClickableText';
import type { MethodProps } from '../types';

export function MiniReadingMethod({
  activity,
  submitting,
  onSubmit,
  onNext,
  onLookup,
}: MethodProps) {
  const { t } = useTranslation('study');
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const startedAt = useRef(Date.now());

  const payload = activity.prompt_payload;
  const paragraph = payload.type === 'mini_reading' ? payload.paragraph : '';
  const question = payload.type === 'mini_reading' ? payload.comprehension_question : undefined;
  const choices = payload.type === 'mini_reading' ? (payload.comprehension_choices ?? []) : [];
  const correctIndex =
    payload.type === 'mini_reading' ? (payload.comprehension_correct_index ?? -1) : -1;
  const hasQuestion = Boolean(question && choices.length > 0);

  useEffect(() => {
    setPicked(null);
    setResult(null);
    startedAt.current = Date.now();
  }, [activity.id]);

  const choose = async (i: number) => {
    if (result !== null || submitting) return;
    setPicked(i);
    const res = await onSubmit({
      is_correct: i === correctIndex,
      response_time_ms: Date.now() - startedAt.current,
    });
    if (res) setResult(res.activity.is_correct ?? false);
  };

  // Passage with no comprehension question: reading it through counts as a pass.
  const finishReading = async () => {
    const res = await onSubmit({
      is_correct: true,
      response_time_ms: Date.now() - startedAt.current,
    });
    if (res) onNext();
  };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('activity.mini_reading')}
        </div>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          <ClickableText text={paragraph} onWordClick={onLookup} />
        </p>
      </div>

      {hasQuestion && (
        <>
          <p className="w-full text-center text-sm font-medium text-foreground">{question}</p>
          <div className="grid w-full max-w-md gap-2">
            {choices.map((opt, i) => {
              const isPicked = picked === i;
              const isAnswer = result !== null && i === correctIndex;
              const isWrongPick = result === false && isPicked;
              return (
                <button
                  key={opt + i}
                  type="button"
                  disabled={result !== null || submitting}
                  onClick={() => choose(i)}
                  className={cn(
                    'rounded-lg border px-4 py-3 text-start text-sm transition-colors',
                    isAnswer && 'border-success bg-success/10 text-success',
                    isWrongPick && 'border-error bg-error/10 text-error',
                    !isAnswer && !isWrongPick && 'border-border hover:border-primary/50',
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {result !== null && (
            <AnswerFeedback isCorrect={result} expected={choices[correctIndex]} />
          )}
          {result !== null && <Button onClick={onNext}>{t('runner.next')}</Button>}
        </>
      )}

      {!hasQuestion && (
        <Button onClick={finishReading} disabled={submitting}>
          {t('runner.next')}
        </Button>
      )}
    </div>
  );
}
