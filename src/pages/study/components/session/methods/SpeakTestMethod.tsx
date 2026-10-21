import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSpeak } from '../../../hooks/useSpeak';
import type { MethodProps } from '../types';

const RATINGS: { value: 1 | 3 | 5; key: string; tone: string }[] = [
  { value: 1, key: 'again', tone: 'border-error/60 text-error hover:bg-error/10' },
  { value: 3, key: 'good', tone: 'border-primary/60 text-primary hover:bg-primary/10' },
  { value: 5, key: 'perfect', tone: 'border-success/60 text-success hover:bg-success/10' },
];

/**
 * Pronunciation drill. The plan-builder only selects this when a microphone is
 * available (currently never — `user_has_microphone` is false server-side), so
 * this is a self-rated fallback rather than an ASR-scored one.
 */
export function SpeakTestMethod({ activity, submitting, onSubmit, onNext }: MethodProps) {
  const { t } = useTranslation('study');
  const { speak } = useSpeak();
  const startedAt = useRef(Date.now());
  const [said, setSaid] = useState(false);

  const payload = activity.prompt_payload;
  const target = payload.type === 'speak_test' ? payload.target : '';

  useEffect(() => {
    setSaid(false);
    startedAt.current = Date.now();
  }, [activity.id]);

  const rate = async (rating: 1 | 3 | 5) => {
    const res = await onSubmit({
      self_rating: rating,
      response_time_ms: Date.now() - startedAt.current,
    });
    if (res) onNext();
  };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('activity.speak_test')}
        </div>
        <div className="mt-3 text-3xl font-semibold text-foreground">{target}</div>
        <Button variant="ghost" size="sm" onClick={() => speak(target)} className="mt-2">
          <Volume2 className="h-4 w-4" />
          {t('runner.listen')}
        </Button>
      </div>

      {!said ? (
        <Button onClick={() => setSaid(true)}>{t('runner.saidIt')}</Button>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {RATINGS.map((r) => (
            <Button
              key={r.value}
              variant="outline"
              disabled={submitting}
              onClick={() => rate(r.value)}
              className={cn(r.tone)}
            >
              {t(`runner.${r.key}`)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
