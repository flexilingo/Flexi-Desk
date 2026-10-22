import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AudioPlayer } from '../AudioPlayer';
import { McqQuestion } from '../McqQuestion';
import { DevSkipButton } from '../DevSkipButton';
import { ConfirmDialog } from '../ConfirmDialog';
import { ExamText } from '../ExamText';
import { saveDraft } from '../../../services/examDraft';
import {
  accrueTcfClock,
  formatClock,
  itemContent,
  restoreTcfClock,
  resumeAudio,
  tcfTimeLeft,
  type TcfClock,
} from '../../../utils/examClocks';
import type { ExamSectionDraft, ListeningContent } from '../../../types';
import { TcfLevelBadge, useLoadedDraft } from './tcfShared';

interface Props {
  sessionId: string;
  content: ListeningContent;
  audioUrls: Record<string, string>;
  timeLimitSec: number;
  /** Resolves false when the server refused the section, so the dialog stays open on the error. */
  onSubmit: (answers: Record<string, number>, timeSpent: number) => Promise<boolean | void> | void;
  isSubmitting: boolean;
}

/**
 * TCF Compréhension orale (TCF Canada, Québec, IRN): one recording per item,
 * played ONCE, forward-only, one section clock. The question and its choices are
 * on screen while the recording plays (as on the computer-based TCF); Next
 * appears once the recording has ended, so a recording is never cut short. The
 * clock stands still while a recording is due or playing and runs while the
 * candidate answers after it (see utils/examClocks.ts).
 *
 * The draft stores `currentQuestion` as "recording heard" (1) or not (0), so a
 * reload never plays a recording twice, and where a cut-off recording stood
 * (`audio`), so a reload picks it up there.
 */
export function TcfListeningSection(props: Props) {
  const { ready, draft } = useLoadedDraft(props.sessionId, 'listening');
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <Inner {...props} draft={draft} />;
}

function Inner({
  sessionId,
  content,
  audioUrls,
  timeLimitSec,
  onSubmit,
  isSubmitting,
  draft,
}: Props & { draft: ExamSectionDraft | null }) {
  const { t } = useTranslation('exam');
  const { t: tc } = useTranslation('celpip');
  const items = content.parts;
  const [itemIndex, setItemIndex] = useState(draft?.partIndex ?? 0);
  const [heard, setHeard] = useState(draft?.currentQuestion === 1);
  const [answers, setAnswers] = useState<Record<string, number>>(
    () => (draft?.answers as Record<string, number> | undefined) ?? {},
  );
  const [resume] = useState(() => ({
    itemIndex: draft?.partIndex ?? 0,
    startAt: resumeAudio(draft).startAt,
  }));
  const [clockInit] = useState(() => restoreTcfClock(draft, Date.now()));
  const [timeLeft, setTimeLeft] = useState(() => tcfTimeLeft(clockInit, timeLimitSec));
  const [showConfirm, setShowConfirm] = useState(false);
  const [devAudioSkip, setDevAudioSkip] = useState(false);
  const autoSubmitRef = useRef(false);

  const clockRef = useRef<TcfClock>(clockInit);
  // True while the current item's recording is due or playing: the clock stands still.
  const recordingRef = useRef(!heard);
  const progressRef = useRef({ itemIndex, heard, answers });
  const audioStateRef = useRef(draft?.audio);

  const persist = useCallback(() => {
    const { itemIndex: partIndex, heard: done, answers: saved } = progressRef.current;
    void saveDraft(sessionId, 'listening', {
      partIndex,
      currentQuestion: done ? 1 : 0,
      answers: saved,
      sectionStartedAt: clockRef.current.startedAt,
      pausedSec: clockRef.current.pausedMs / 1000,
      audio: audioStateRef.current,
    });
  }, [sessionId]);

  const accrue = useCallback(() => {
    clockRef.current = accrueTcfClock(clockRef.current, Date.now(), recordingRef.current);
  }, []);

  useEffect(() => {
    // Saved every tick: leaving between saves must not lose clock time.
    const id = setInterval(() => {
      accrue();
      setTimeLeft(tcfTimeLeft(clockRef.current, timeLimitSec));
      persist();
    }, 1000);
    return () => clearInterval(id);
  }, [accrue, persist, timeLimitSec]);

  useEffect(() => {
    progressRef.current = { itemIndex, heard, answers };
    persist();
  }, [itemIndex, heard, answers, persist]);

  /** The recording ended (true) or the next item's recording is due (false). */
  const setRecordingDone = (done: boolean) => {
    accrue();
    recordingRef.current = !done;
    setHeard(done);
  };

  const isLast = itemIndex >= items.length - 1;
  const key = `part_${itemIndex}_q_0`;

  const handleSubmit = useCallback(async () => {
    const timeSpent = Math.round((Date.now() - clockRef.current.startedAt) / 1000);
    const ok = await onSubmit(answers, timeSpent);
    if (ok !== false) setShowConfirm(false);
  }, [answers, onSubmit]);

  const goNext = () => {
    if (isLast) {
      setShowConfirm(true);
      return;
    }
    audioStateRef.current = undefined;
    setItemIndex((i) => i + 1);
    setRecordingDone(false);
    setDevAudioSkip(false);
  };

  useEffect(() => {
    if (timeLeft === 0 && !autoSubmitRef.current && !isSubmitting) {
      autoSubmitRef.current = true;
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const item = items[itemIndex];
  if (!item) return null;
  const meta = itemContent(item);
  const question = item.questions[0];
  const clockPaused = !heard;

  const handleDevSkip = () => {
    if (!heard) {
      setDevAudioSkip(true);
      return;
    }
    if (answers[key] === undefined) setAnswers((prev) => ({ ...prev, [key]: 0 }));
    goNext();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium tabular-nums text-foreground">
          {t('tcf.itemOf', { current: itemIndex + 1, total: items.length })}
          <TcfLevelBadge level={meta.level} />
        </span>
        <span
          className="inline-flex items-center gap-1.5"
          title={clockPaused ? t('tcf.clockPaused') : t('tcf.timeLeft')}
        >
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t('tcf.timeLeft')}
          </span>
          {clockPaused && <Pause className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          <span
            data-testid="tcf-clock"
            className={`font-mono text-sm font-bold tabular-nums ${
              clockPaused
                ? 'text-muted-foreground'
                : timeLeft < 300
                  ? 'text-error'
                  : 'text-foreground'
            }`}
          >
            {formatClock(timeLeft)}
          </span>
          {clockPaused && <span className="sr-only">{t('tcf.clockPaused')}</span>}
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {t('tcf.itemsLeft', { count: items.length - itemIndex })}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="mx-auto w-full max-w-2xl">
          <p className="pt-3 text-xs text-muted-foreground">{t('tcf.listeningOnce')}</p>
          {meta.context && (
            <div lang="fr">
              <ExamText base={14} className="mb-3 mt-2 text-foreground">
                {meta.context}
              </ExamText>
            </div>
          )}

          {heard && (
            <div className="mb-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              {t('tcf.audioDone')}
            </div>
          )}
          {!heard && (
            <AudioPlayer
              key={`item_${itemIndex}`}
              src={item.audio_url || audioUrls[`part_${itemIndex + 1}`] || ''}
              onComplete={() => {
                audioStateRef.current = { partIndex: itemIndex, pos: 0, done: true };
                setRecordingDone(true);
              }}
              onProgress={(sec) => {
                audioStateRef.current = { partIndex: itemIndex, pos: sec, done: false };
              }}
              startAt={itemIndex === resume.itemIndex ? resume.startAt : 0}
              autoPlay
              forceComplete={devAudioSkip}
              playingHint={t('tcf.answerWhileListening')}
            />
          )}

          {question && (
            <div lang="fr">
              <McqQuestion
                questionText={question.question}
                options={question.options}
                selectedIndex={answers[key] ?? null}
                onChange={(i) => setAnswers((prev) => ({ ...prev, [key]: i }))}
                questionNumber={itemIndex + 1}
              />
            </div>
          )}

          {heard && (
            <div className="mt-4 flex justify-end">
              {isLast ? (
                <Button size="md" onClick={() => setShowConfirm(true)} loading={isSubmitting}>
                  {tc('submit')}
                </Button>
              ) : (
                <Button variant="accent" size="md" onClick={goNext}>
                  {tc('next')} →
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        variant="info"
        title={tc('confirmSubmit')}
        description={tc('confirmSubmitMessage')}
        confirmText={tc('confirm')}
        cancelText={tc('cancel')}
        onConfirm={handleSubmit}
        isLoading={isSubmitting}
      />

      <DevSkipButton
        label={heard ? 'Skip question' : 'Skip audio'}
        onClick={handleDevSkip}
        disabled={isSubmitting}
      />
    </div>
  );
}
