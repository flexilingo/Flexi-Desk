import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnswerFeedback } from '../AnswerFeedback';
import { InsightsPanel } from '../InsightsPanel';
import { HintRow } from '../HintRow';
import type { MethodProps } from '../types';

export function TypeTestMethod({
  activity,
  cardMeta,
  submitting,
  onSubmit,
  onNext,
  onLookup,
}: MethodProps) {
  const { t } = useTranslation('study');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const startedAt = useRef(Date.now());

  const payload = activity.prompt_payload;
  const promptText =
    payload.type === 'type_test' ? payload.prompt_text : (cardMeta?.back_text ?? '');
  const target = payload.type === 'type_test' ? payload.target : (cardMeta?.front_text ?? '');

  useEffect(() => {
    setValue('');
    setResult(null);
    startedAt.current = Date.now();
  }, [activity.id]);

  const check = async () => {
    if (!value.trim() || result !== null) return;
    const res = await onSubmit({
      user_response: value,
      response_time_ms: Date.now() - startedAt.current,
    });
    if (res) setResult(res.activity.is_correct ?? false);
  };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('activity.type_test')}
        </div>
        <div className="mt-3 text-2xl font-semibold text-foreground">{promptText}</div>
      </div>

      <Input
        autoFocus
        value={value}
        disabled={result !== null}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (result === null) check();
          else onNext();
        }}
        onPaste={(e) => e.preventDefault()}
        placeholder={t('runner.typePlaceholder')}
        className="max-w-md text-center"
      />

      {result === null && (
        <HintRow target={target} activityId={activity.id} disabled={submitting} />
      )}

      {result !== null && <AnswerFeedback isCorrect={result} expected={target} />}
      {result !== null && cardMeta?.notes && (
        <InsightsPanel notes={cardMeta.notes} onLookup={onLookup} />
      )}

      {result === null ? (
        <Button onClick={check} disabled={!value.trim() || submitting}>
          {t('runner.check')}
        </Button>
      ) : (
        <Button onClick={onNext}>{t('runner.next')}</Button>
      )}
    </div>
  );
}
