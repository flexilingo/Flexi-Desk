import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnswerFeedback } from '../AnswerFeedback';
import { InsightsPanel } from '../InsightsPanel';
import { HintRow } from '../HintRow';
import type { MethodProps } from '../types';

/** Splits "a ____ b" into the parts around the blank so we can inline the answer. */
function splitBlank(sentence: string): [string, string] {
  const idx = sentence.indexOf('____');
  if (idx === -1) return [sentence, ''];
  return [sentence.slice(0, idx), sentence.slice(idx + 4)];
}

export function ClozeMethod({
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
  const sentence = payload.type === 'cloze' ? payload.sentence : '';
  const target = payload.type === 'cloze' ? payload.target : (cardMeta?.front_text ?? '');
  const [before, after] = splitBlank(sentence);

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
      <div className="w-full rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('activity.cloze')}
        </div>
        <p className="mt-3 text-center text-xl leading-relaxed text-foreground">
          {before}
          <span
            className={
              result === null
                ? 'mx-1 inline-block min-w-24 border-b-2 border-dashed border-primary align-baseline'
                : 'mx-1 font-semibold text-primary'
            }
          >
            {result === null ? ' ' : target}
          </span>
          {after}
        </p>
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
