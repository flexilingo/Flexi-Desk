import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AnswerFeedback } from '../AnswerFeedback';
import type { MethodProps } from '../types';
import type { SentenceCoaching } from '../../../types';

export function UseInSentenceMethod({
  activity,
  cardMeta,
  submitting,
  onSubmit,
  onNext,
}: MethodProps) {
  const { t } = useTranslation('study');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const [coaching, setCoaching] = useState<SentenceCoaching | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const payload = activity.prompt_payload;
  const target = payload.type === 'use_in_sentence' ? payload.target : (cardMeta?.front_text ?? '');
  const hint = payload.type === 'use_in_sentence' ? payload.topic_hint : undefined;

  useEffect(() => {
    setValue('');
    setResult(null);
    setCoaching(null);
    setFeedback(null);
    startedAt.current = Date.now();
  }, [activity.id]);

  const submit = async () => {
    if (!value.trim() || result !== null) return;
    const res = await onSubmit({
      user_response: value,
      response_time_ms: Date.now() - startedAt.current,
    });
    if (res) {
      setResult(res.activity.is_correct ?? false);
      setCoaching(res.coaching);
      setFeedback(res.activity.ai_feedback);
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('activity.use_in_sentence')}
        </div>
        <div className="mt-3 text-2xl font-semibold text-foreground">{target}</div>
        {hint && <div className="mt-1 text-sm text-muted-foreground">{hint}</div>}
      </div>

      <textarea
        autoFocus
        rows={3}
        value={value}
        disabled={result !== null}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('runner.sentencePlaceholder')}
        className="w-full max-w-xl rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-70"
      />

      {result !== null && <AnswerFeedback isCorrect={result} />}
      {result !== null && feedback && <p className="text-sm text-muted-foreground">{feedback}</p>}

      {coaching && (
        <div className="w-full max-w-xl space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
          {coaching.corrected && (
            <p className="text-foreground">
              <span className="font-semibold">{t('runner.corrected')}:</span> {coaching.corrected}
            </p>
          )}
          {coaching.corrections.length > 0 && (
            <ul className="space-y-1">
              {coaching.corrections.map((c, i) => (
                <li key={i} className="text-muted-foreground">
                  <span className="text-error line-through">{c.wrong}</span>
                  {' → '}
                  <span className="font-semibold text-success">{c.right}</span>
                  {c.note && <span className="ms-1 text-xs">({c.note})</span>}
                </li>
              ))}
            </ul>
          )}
          {coaching.examples.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('runner.examples')}
              </div>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {coaching.examples.map((ex, i) => (
                  <li key={i}>— {ex}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {result === null ? (
        <Button onClick={submit} disabled={!value.trim() || submitting}>
          {t('runner.check')}
        </Button>
      ) : (
        <Button onClick={onNext}>{t('runner.next')}</Button>
      )}
    </div>
  );
}
