import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnswerFeedback } from '../AnswerFeedback';
import { ClickableText } from '../ClickableText';
import type { MethodProps } from '../types';

export function SynonymMethod({ activity, submitting, onSubmit, onNext, onLookup }: MethodProps) {
  const { t } = useTranslation('study');
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const startedAt = useRef(Date.now());

  const payload = activity.prompt_payload;
  const sentence = payload.type === 'synonym_discrim' ? payload.context_sentence : '';
  const options = payload.type === 'synonym_discrim' ? payload.options : [];
  const correctIndex = payload.type === 'synonym_discrim' ? payload.correct_index : -1;

  useEffect(() => {
    setPicked(null);
    setResult(null);
    startedAt.current = Date.now();
  }, [activity.id]);

  const choose = async (i: number) => {
    if (result !== null || submitting) return;
    setPicked(i);
    const res = await onSubmit({
      user_response: String(i),
      response_time_ms: Date.now() - startedAt.current,
    });
    if (res) setResult(res.activity.is_correct ?? false);
  };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="w-full rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('activity.synonym_discrim')}
        </div>
        <p className="mt-3 text-center text-lg leading-relaxed text-foreground">
          <ClickableText text={sentence} onWordClick={onLookup} />
        </p>
      </div>

      <div className="grid w-full max-w-md gap-2">
        {options.map((opt, i) => {
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

      {result !== null && <AnswerFeedback isCorrect={result} expected={options[correctIndex]} />}
      {result !== null && <Button onClick={onNext}>{t('runner.next')}</Button>}
    </div>
  );
}
