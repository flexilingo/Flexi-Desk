import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, SpellCheck, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { useAiSource } from '@/stores/aiSourceStore';
import { AnswerFeedback } from '../AnswerFeedback';
import { Scorecard } from '../Scorecard';
import { useSpeak } from '../../../hooks/useSpeak';
import type { MethodProps } from '../types';
import type { Scorecard as ScorecardData, SentenceCoaching } from '../../../types';

/**
 * Use the word in a sentence. The sentence is judged by the learner's own AI (the model
 * on their computer, or their own key — never the cloud unless they switched it on): a
 * scorecard (meaning, grammar, spelling, elision), spelling and grammar corrections, and a
 * couple of good example sentences. Without an AI the structural check stands in, and the
 * screen says why there is no scorecard instead of leaving the learner guessing.
 */
export function UseInSentenceMethod({
  activity,
  cardMeta,
  submitting,
  onSubmit,
  onNext,
  advancing,
}: MethodProps) {
  const { t } = useTranslation('study');
  const { speak } = useSpeak();
  const { own: ownAi } = useAiSource();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const [coaching, setCoaching] = useState<SentenceCoaching | null>(null);
  const [judgement, setJudgement] = useState<ScorecardData | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const payload = activity.prompt_payload;
  const target = payload.type === 'use_in_sentence' ? payload.target : (cardMeta?.front_text ?? '');
  const hint = payload.type === 'use_in_sentence' ? payload.topic_hint : undefined;

  useEffect(() => {
    setValue('');
    setResult(null);
    setCoaching(null);
    setJudgement(null);
    setScore(null);
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
      setJudgement(res.judgement);
      setScore(res.activity.score);
      setFeedback(res.activity.ai_feedback);
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('runner.useInSentence')}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <div className="text-2xl font-semibold text-foreground">{target}</div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void speak(target)}
            title={t('runner.listen')}
          >
            <Volume2 className="h-4 w-4" />
          </Button>
        </div>
        {hint && <div className="mt-1 text-sm text-muted-foreground">{hint}</div>}
      </div>

      {/* Why there is no scorecard: nothing here is graded by a model until the learner's AI is set up. */}
      {result === null && ownAi.kind === 'unconfigured' && <AiSetupCard compact />}

      <textarea
        autoFocus
        rows={3}
        value={value}
        disabled={result !== null}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('runner.sentencePlaceholder')}
        dir="auto"
        className="w-full max-w-xl rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-70"
      />

      {result !== null && <AnswerFeedback isCorrect={result} />}
      {result !== null && judgement && (
        <div className="w-full max-w-xl">
          <Scorecard card={judgement} />
        </div>
      )}
      {result !== null && !judgement && feedback && (
        <p className="text-sm text-muted-foreground">{feedback}</p>
      )}
      {result !== null &&
        !judgement &&
        score != null &&
        coaching === null &&
        ownAi.kind === 'unconfigured' && (
          <p className="max-w-xl text-center text-xs text-caption">{t('scorecard.needsAi')}</p>
        )}

      {/* Spelling / grammar corrections (only when there are any). */}
      {coaching && coaching.corrections.length > 0 && (
        <div className="w-full max-w-xl space-y-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-warning">
            <SpellCheck className="h-3.5 w-3.5" />
            {t('runner.corrections')}
          </div>
          {coaching.corrected && (
            <p className="text-sm text-foreground" dir="auto">
              <span className="font-semibold">{t('runner.corrected')}:</span> {coaching.corrected}
            </p>
          )}
          {coaching.corrections.map((c, i) => (
            <div key={i} className="text-[13px] leading-relaxed">
              <div className="flex flex-wrap items-center gap-2" dir="ltr">
                <span className="text-error line-through">{c.wrong}</span>
                <span className="text-caption">→</span>
                <span className="font-semibold text-success">{c.right}</span>
                <span className="rounded border border-border px-1 py-0.5 text-[9px] uppercase tracking-wider text-caption">
                  {t(`runner.kind.${c.kind}`)}
                </span>
              </div>
              {c.note && (
                <p className="mt-0.5 text-xs text-muted-foreground" dir="auto">
                  {c.note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Model example sentences (always shown when there are any). */}
      {coaching && coaching.examples.length > 0 && (
        <div className="w-full max-w-xl space-y-2 rounded-lg border border-success/40 bg-success/10 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-success">
            <Lightbulb className="h-3.5 w-3.5" />
            {t('runner.examples')}
          </div>
          <ul className="space-y-1.5">
            {coaching.examples.map((ex, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-sm leading-relaxed text-foreground"
                dir="ltr"
              >
                <button
                  type="button"
                  onClick={() => void speak(ex)}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-caption transition-colors hover:bg-muted hover:text-foreground"
                  title={t('runner.listen')}
                  aria-label={t('runner.listen')}
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
                <span>“{ex}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result === null ? (
        <Button onClick={submit} loading={submitting} disabled={!value.trim() && !submitting}>
          {submitting ? t('runner.grading') : t('runner.check')}
        </Button>
      ) : (
        <Button onClick={onNext} loading={advancing}>
          {t('runner.next')}
        </Button>
      )}
    </div>
  );
}
