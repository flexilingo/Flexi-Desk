import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpeak } from '../../../hooks/useSpeak';
import { ratingIntervalLabels } from '../../../utils/srs-display';
import { InsightsPanel } from '../InsightsPanel';
import { RatingButtons } from '../RatingButtons';
import type { MethodProps } from '../types';

/**
 * Listening drill. Plays the captured encounter clip when one exists; otherwise
 * speaks the snippet through local TTS (the offline path — desk has no cloud
 * clip pipeline). Reveal, then self-rate like a flashcard.
 */
export function ListenAgainMethod({
  activity,
  cardMeta,
  srsAlgorithm,
  cardProgress,
  predictedIntervals,
  submitting,
  onSubmit,
  onNext,
  onLookup,
}: MethodProps) {
  const { t } = useTranslation('study');
  const { speak } = useSpeak();
  const [revealed, setRevealed] = useState(false);
  const [submittingRating, setSubmittingRating] = useState<number | null>(null);
  const startedAt = useRef(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedFor = useRef<string | null>(null);

  const intervals = useMemo(() => {
    // The scheduler's own numbers; the formula port only for an older backend.
    return ratingIntervalLabels(predictedIntervals, srsAlgorithm, cardProgress);
  }, [srsAlgorithm, cardProgress, predictedIntervals]);

  const payload = activity.prompt_payload;
  const clipUrl = payload.type === 'listen_again' ? payload.audio_clip_url : '';
  const snippet =
    payload.type === 'listen_again' ? payload.source_snippet : (cardMeta?.front_text ?? '');
  const answer = cardMeta?.back_text ?? '';

  const play = () => {
    if (clipUrl) {
      audioRef.current?.play().catch(() => {});
    } else {
      speak(snippet);
    }
  };

  useEffect(() => {
    setRevealed(false);
    setSubmittingRating(null);
    startedAt.current = Date.now();
  }, [activity.id]);

  // Auto-play once per activity.
  useEffect(() => {
    if (playedFor.current === activity.id) return;
    playedFor.current = activity.id;
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id]);

  const rate = async (rating: 1 | 2 | 3 | 4 | 5) => {
    if (submittingRating !== null) return;
    setSubmittingRating(rating);
    const res = await onSubmit({
      self_rating: rating,
      response_time_ms: Date.now() - startedAt.current,
    });
    setSubmittingRating(null);
    if (res) onNext();
  };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('activity.listen_again')}
        </div>

        <Button variant="outline" size="lg" onClick={play} className="mt-4">
          <Volume2 className="h-5 w-5" />
          {t('runner.listen')}
        </Button>

        {clipUrl && <audio ref={audioRef} src={clipUrl} preload="auto" />}

        {revealed && (
          <div className="mt-5 space-y-1 border-t border-border pt-5">
            <div className="text-2xl font-semibold text-foreground">{snippet}</div>
            {answer && <div className="text-lg text-muted-foreground">{answer}</div>}
          </div>
        )}
      </div>

      {revealed && cardMeta?.notes && <InsightsPanel notes={cardMeta.notes} onLookup={onLookup} />}

      {!revealed ? (
        <Button onClick={() => setRevealed(true)} disabled={submitting}>
          {t('runner.show')}
        </Button>
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
