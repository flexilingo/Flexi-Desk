import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpeak } from '../../../hooks/useSpeak';
import { formatInterval, predictIntervals } from '../../../utils/srs-display';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import type { MethodProps, StudySubmitArgs } from '../types';
import { InsightsPanel } from '../InsightsPanel';
import { ClickableText } from '../ClickableText';
import { RatingButtons } from '../RatingButtons';

export function RecallMethod({
  activity,
  cardMeta,
  config,
  srsAlgorithm,
  cardProgress,
  submitting,
  onSubmit,
  onNext,
  onLookup,
}: MethodProps) {
  const { t } = useTranslation('study');
  const { speak } = useSpeak();
  const [flipped, setFlipped] = useState(false);
  const [submittingRating, setSubmittingRating] = useState<number | null>(null);
  const startedAt = useRef(Date.now());
  const pronouncedFor = useRef<string | null>(null);

  const payload = activity.prompt_payload;
  const reverse = payload.type === 'recall' ? payload.reverse : false;
  const frontText = payload.type === 'recall' ? payload.front_text : (cardMeta?.front_text ?? '');
  const backText = payload.type === 'recall' ? payload.back_text : (cardMeta?.back_text ?? '');

  // The prompt side depends on reverse_card; the answer is the other side.
  const promptText = reverse ? backText : frontText;
  const answerText = reverse ? frontText : backText;

  // Display-only next-review estimates, one per rating.
  const intervals = useMemo(() => {
    const days = predictIntervals(srsAlgorithm, cardProgress);
    return Object.fromEntries(
      Object.entries(days).map(([r, d]) => [r, formatInterval(d)]),
    ) as Record<number, string>;
  }, [srsAlgorithm, cardProgress]);

  useEffect(() => {
    setFlipped(false);
    setSubmittingRating(null);
    startedAt.current = Date.now();
  }, [activity.id]);

  // Auto-pronounce the word once per activity (StrictMode-safe via the ref guard).
  useEffect(() => {
    if (!config?.auto_pronounce) return;
    if (pronouncedFor.current === activity.id) return;
    pronouncedFor.current = activity.id;
    speak(frontText);
  }, [activity.id, config?.auto_pronounce, frontText, speak]);

  const rate = async (rating: 1 | 2 | 3 | 4 | 5) => {
    if (submittingRating !== null) return;
    setSubmittingRating(rating);
    const args: StudySubmitArgs = {
      self_rating: rating,
      response_time_ms: Date.now() - startedAt.current,
    };
    const res = await onSubmit(args);
    setSubmittingRating(null);
    if (res) onNext();
  };

  // Space/Enter flips; 1-5 rates once flipped.
  useKeyboardShortcuts({
    enabled: !submitting,
    onFlip: () => setFlipped(true),
    onRate: flipped ? (r) => void rate(r) : undefined,
  });

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="flex items-center justify-center gap-2">
          <div className="text-3xl font-semibold text-foreground">{promptText}</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => speak(promptText)}
            title={t('runner.listen')}
          >
            <Volume2 className="h-4 w-4" />
          </Button>
        </div>

        {(flipped || config?.always_show_translation) && (
          <div className="mt-5 border-t border-border pt-5 text-xl text-muted-foreground">
            <ClickableText text={answerText} onWordClick={onLookup} />
          </div>
        )}
      </div>

      {flipped && cardMeta?.notes && <InsightsPanel notes={cardMeta.notes} onLookup={onLookup} />}

      {!flipped ? (
        <Button onClick={() => setFlipped(true)}>{t('runner.show')}</Button>
      ) : (
        <RatingButtons
          submittingRating={submittingRating}
          onRatingSubmit={(r) => void rate(r)}
          predictedIntervals={intervals}
        />
      )}
    </div>
  );
}
