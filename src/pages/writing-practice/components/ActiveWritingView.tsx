import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle, Clock, Loader2, PenLine, Send, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AiErrorOrSetup } from '@/components/ai/AiErrorOrSetup';
import { InlineError } from '@/components/common/InlineError';
import { isAiSetupError } from '@/lib/aiSource';
import { cn } from '@/lib/utils';
import * as api from '../lib/api';
import { writingErrorText } from '../lib/errors';
import { MIN_WORDS, countWords, elapsedSeconds, formatTime, timeRemaining } from '../lib/session';
import { useAutosave } from '../lib/useAutosave';
import type { WritingSession } from '../lib/types';
import { GradingState } from './bits';
import { PromptCard } from './PromptCard';

interface Props {
  session: WritingSession;
  /** Called with the graded session once the AI answered. */
  onGraded: (session: WritingSession) => void;
}

export function ActiveWritingView({ session, onGraded }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation('writingPractice');

  const [essayText, setEssayText] = useState(session.essay_text ?? '');
  const [error, setError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const sessionId = session.id;
  const startedAt = session.started_at;
  const wordCount = countWords(essayText);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeSpent = elapsedSeconds(startedAt, now);
  const remaining = timeRemaining(startedAt, session.time_limit_seconds, now);
  const isTimeUp = remaining !== null && remaining <= 0;

  const autosave = useAutosave(
    useCallback(
      (text: string) =>
        api.saveDraft({
          session_id: sessionId,
          essay_text: text,
          word_count: countWords(text),
          time_spent_seconds: elapsedSeconds(startedAt, Date.now()),
        }),
      [sessionId, startedAt],
    ),
  );

  const onChange = (text: string) => {
    setEssayText(text);
    autosave.schedule(text);
  };

  const submit = useCallback(async () => {
    if (!essayText.trim()) return;
    setError(null);
    setSetupError(null);
    setSubmitting(true);
    autosave.cancel();
    try {
      const graded = await api.submitEssay({
        session_id: sessionId,
        essay_text: essayText,
        word_count: wordCount,
        time_spent_seconds: elapsedSeconds(startedAt, Date.now()),
      });
      onGraded(graded);
    } catch (err) {
      // The essay stays saved. A not-set-up AI gets the setup card; the rest an inline error.
      if (isAiSetupError(err)) setSetupError(String(err));
      else setError(writingErrorText(t, err));
      setSubmitting(false);
    }
  }, [essayText, wordCount, sessionId, startedAt, autosave, onGraded, t]);

  const stop = async () => {
    setStopping(true);
    setStopError(null);
    try {
      await api.cancelSession(sessionId);
      navigate('/writing-practice');
    } catch (err) {
      setStopError(writingErrorText(t, err));
      setStopping(false);
    }
  };

  if (submitting) {
    return <GradingState title={t('submitting')} body={t('feedback.gradingDescription')} />;
  }

  const canSubmit = wordCount >= MIN_WORDS && !isTimeUp;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <button
        type="button"
        onClick={() => navigate('/writing-practice')}
        className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        {t('backToList')}
      </button>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {session.prompt && <PromptCard prompt={session.prompt} examType={session.exam_type} />}

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <textarea
              value={essayText}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t('editor.placeholder')}
              disabled={isTimeUp}
              aria-label={t('editor.placeholder')}
              className="min-h-[480px] w-full resize-none border-0 bg-transparent p-5 text-[15px] leading-[1.8] text-foreground outline-none placeholder:text-caption disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="flex min-h-[36px] items-center justify-end border-t border-border bg-accent/[0.04] px-5 py-2">
              {autosave.status === 'saving' && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('editor.saving')}
                </span>
              )}
              {autosave.status === 'saved' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                  <CheckCircle className="h-3 w-3" />
                  {t('editor.autoSaved')}
                </span>
              )}
            </div>
          </div>

          {setupError && (
            <AiErrorOrSetup
              message={setupError}
              onReady={() => {
                setSetupError(null);
                void submit();
              }}
            />
          )}
          {error && <InlineError message={error} onDismiss={() => setError(null)} />}
        </div>

        <aside className="lg:sticky lg:top-6">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div>
              <p className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-accent/70">
                <Clock className="h-3 w-3" />
                {t('timerToggle')}
              </p>
              {session.timer_enabled && remaining !== null ? (
                <p
                  data-testid="timer"
                  className={cn(
                    'text-[28px] font-extrabold leading-none tabular-nums',
                    isTimeUp || remaining < 60
                      ? 'text-error'
                      : remaining < 300
                        ? 'text-accent/80'
                        : 'text-foreground',
                  )}
                >
                  {isTimeUp ? t('timer.timeUp') : formatTime(remaining)}
                </p>
              ) : (
                <p
                  data-testid="timer"
                  className="text-[28px] font-extrabold leading-none tabular-nums text-foreground"
                >
                  {formatTime(timeSpent)}
                </p>
              )}
            </div>

            <div className="h-px bg-border" />

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-accent/70">
                  <PenLine className="h-3 w-3" />
                  {t('history.wordsWritten')}
                </p>
                <span
                  className={cn(
                    'text-[11.5px] font-semibold tabular-nums',
                    wordCount >= MIN_WORDS ? 'text-success' : 'text-accent/80',
                  )}
                >
                  {wordCount} / {MIN_WORDS}
                </span>
              </div>
              <progress
                max={MIN_WORDS}
                value={Math.min(wordCount, MIN_WORDS)}
                aria-label={t('history.wordsWritten')}
                className={cn(
                  'block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted',
                  wordCount >= MIN_WORDS
                    ? '[&::-webkit-progress-value]:bg-success [&::-moz-progress-bar]:bg-success'
                    : '[&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:bg-accent',
                )}
              />
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col items-start gap-2">
              <Button variant="default" onClick={() => void submit()} disabled={!canSubmit}>
                <Send />
                {t('submit')}
              </Button>
              {wordCount > 0 && wordCount < MIN_WORDS && (
                <p className="text-[10.5px] text-accent/80">
                  {t('editor.wordsToGo', { count: MIN_WORDS - wordCount })}
                </p>
              )}
              {isTimeUp && (
                <Button variant="destructive" size="sm" onClick={() => setConfirmStop(true)}>
                  <StopCircle />
                  {t('timer.timeUp')}
                </Button>
              )}
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={confirmStop} onOpenChange={(o) => !stopping && setConfirmStop(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('timer.timeUp')}</DialogTitle>
            <DialogDescription>{t('timer.stopMessage')}</DialogDescription>
          </DialogHeader>
          {stopError && <InlineError message={stopError} />}
          <DialogFooter>
            <Button variant="outline" disabled={stopping} onClick={() => setConfirmStop(false)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" loading={stopping} onClick={() => void stop()}>
              {t('timer.stop')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
