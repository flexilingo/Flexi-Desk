import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WordCount } from '../WordCount';
import { DevSkipButton } from '../DevSkipButton';
import { ConfirmDialog } from '../ConfirmDialog';
import { ExamText } from '../ExamText';
import { useExamFontScale } from '../ExamSettingsContext';
import { saveDraft } from '../../../services/examDraft';
import { countWords, formatClock, initialTimeLeft } from '../../../utils/examClocks';
import type { ExamSectionDraft, WritingPrompts } from '../../../types';
import { useLoadedDraft } from './tcfShared';

interface TcfDocument {
  label?: string;
  heading?: string;
  text?: string;
}

interface TcfWritingTask {
  task_index: number;
  title?: string;
  consigne?: string;
  prompt?: string;
  documents?: TcfDocument[];
  word_limit_min: number;
  word_limit_max: number;
}

interface Props {
  sessionId: string;
  prompts: WritingPrompts;
  timeLimitSec: number;
  /** Resolves false when the server refused the section, so the dialog stays open on the error. */
  onSubmit: (answers: Record<string, string>, timeSpent: number) => Promise<boolean | void> | void;
  isSubmitting: boolean;
  /** Practice: the clock stops while the learner is away, so Resume reopens the paper
   *  with the time it had. A full sitting keeps the wall clock, as the real test does. */
  pauseClockWhileAway?: boolean;
}

/**
 * TCF Expression écrite: three tasks under ONE shared clock, free to move
 * between them. The min/max word counts are shown and warned about, never
 * enforced — the candidate may still submit.
 */
export function TcfWritingSection(props: Props) {
  const { ready, draft } = useLoadedDraft(props.sessionId, 'writing');
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
  prompts,
  timeLimitSec,
  onSubmit,
  isSubmitting,
  pauseClockWhileAway = false,
  draft,
}: Props & { draft: ExamSectionDraft | null }) {
  const { t } = useTranslation('exam');
  const { t: tc } = useTranslation('celpip');
  const fontScale = useExamFontScale();
  const tasks = prompts.tasks as unknown as TcfWritingTask[];
  const [taskIndex, setTaskIndex] = useState(() =>
    Math.min(Math.max(0, draft?.taskIndex ?? 0), Math.max(0, tasks.length - 1)),
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => (draft?.answers as Record<string, string> | undefined) ?? {},
  );
  const [timeLeft, setTimeLeft] = useState(() =>
    initialTimeLeft(draft, timeLimitSec, pauseClockWhileAway, Date.now()),
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [startedAt] = useState(() => draft?.sectionStartedAt || Date.now());
  const activeSecRef = useRef(timeLimitSec - timeLeft);
  const autoSubmitRef = useRef(false);
  const progressRef = useRef({ taskIndex, answers });

  useEffect(() => {
    progressRef.current = { taskIndex, answers };
  }, [taskIndex, answers]);

  const persist = useCallback(() => {
    void saveDraft(sessionId, 'writing', {
      partIndex: 0,
      currentQuestion: 0,
      ...progressRef.current,
      sectionStartedAt: startedAt,
      activeSec: activeSecRef.current,
    });
  }, [sessionId, startedAt]);

  // Saved every tick: leaving between saves must not lose clock time.
  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft((s) => Math.max(0, s - 1));
      activeSecRef.current = Math.min(timeLimitSec, activeSecRef.current + 1);
      persist();
    }, 1000);
    return () => clearInterval(id);
  }, [persist, timeLimitSec]);

  useEffect(() => {
    persist();
  }, [taskIndex, answers, persist]);

  const handleSubmit = useCallback(async () => {
    const ok = await onSubmit(answers, Math.round((Date.now() - startedAt) / 1000));
    if (ok !== false) setShowConfirm(false);
  }, [answers, onSubmit, startedAt]);

  useEffect(() => {
    if (timeLeft === 0 && !autoSubmitRef.current && !isSubmitting) {
      autoSubmitRef.current = true;
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const task = tasks[taskIndex];
  if (!task) return null;

  const textFor = (i: number) => answers[`task_${i}`] || '';
  const outOfRange = tasks
    .map((tk, i) => ({
      i,
      count: countWords(textFor(i)),
      min: tk.word_limit_min,
      max: tk.word_limit_max,
    }))
    .filter((w) => w.count < w.min || w.count > w.max);
  const currentText = textFor(taskIndex);
  const currentCount = countWords(currentText);
  const currentOut =
    currentCount > 0 && (currentCount < task.word_limit_min || currentCount > task.word_limit_max);
  const isLast = taskIndex >= tasks.length - 1;

  const handleDevSkip = () => {
    if (!currentText.trim()) {
      setAnswers((prev) => ({
        ...prev,
        [`task_${taskIndex}`]:
          'Ceci est une réponse factice utilisée uniquement pour tester le parcours de l’examen.',
      }));
    }
    if (!isLast) setTaskIndex((i) => i + 1);
    else setShowConfirm(true);
  };

  const confirmDescription =
    outOfRange.length > 0 ? (
      <span>
        {tc('confirmSubmitMessage')}
        <span className="mt-2 block text-warning">
          {outOfRange
            .map((w) =>
              t('tcf.wordRangeTask', { task: w.i + 1, count: w.count, min: w.min, max: w.max }),
            )
            .join(' · ')}
        </span>
      </span>
    ) : (
      tc('confirmSubmitMessage')
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
        <div className="flex gap-1">
          {tasks.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setTaskIndex(i)}
              className={`rounded-[7px] px-2.5 py-1 text-xs font-semibold transition-colors ${
                i === taskIndex
                  ? 'bg-primary text-primary-foreground'
                  : textFor(i).trim()
                    ? 'bg-primary/15 text-primary hover:bg-primary/25'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {tc('task')} {i + 1}
            </button>
          ))}
        </div>
        <span
          data-testid="tcf-clock"
          className={`font-mono text-sm font-bold ${timeLeft < 300 ? 'text-error' : 'text-foreground'}`}
        >
          {formatClock(timeLeft)}
        </span>
        <WordCount text={currentText} min={task.word_limit_min} max={task.word_limit_max} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="w-full overflow-y-auto border-b border-border bg-muted/40 p-4 md:w-1/2 md:border-b-0 md:border-e">
          <div lang="fr">
            {task.title && <h3 className="mb-3 font-semibold text-foreground">{task.title}</h3>}
            <ExamText base={14} className="mb-3 whitespace-pre-line text-foreground">
              {task.consigne ?? task.prompt ?? ''}
            </ExamText>
            {Array.isArray(task.documents) && task.documents.length > 0 && (
              <div className="mb-3 flex flex-col gap-3">
                {task.documents.map((doc, i) => (
                  <div key={i} className="rounded-[9px] border border-border bg-card p-3">
                    {doc.label && (
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-primary">
                        {doc.label}
                      </p>
                    )}
                    {doc.heading && (
                      <p className="mb-1 text-sm font-semibold text-foreground">{doc.heading}</p>
                    )}
                    <ExamText base={14} className="whitespace-pre-line text-foreground">
                      {doc.text ?? ''}
                    </ExamText>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            {t('tcf.wordLimit', { min: task.word_limit_min, max: task.word_limit_max })}
          </div>
        </div>

        <div className="flex w-full flex-col p-4 md:w-1/2">
          <textarea
            lang="fr"
            spellCheck={false}
            className="min-h-[200px] flex-1 resize-none rounded-[9px] border border-border bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary md:min-h-0"
            // Same inline-size exception as ExamText: the user's chosen text scale.
            style={{ fontSize: `${Math.round(14 * fontScale * 10) / 10}px` }}
            placeholder={t('tcf.writingPlaceholder')}
            value={currentText}
            onChange={(e) =>
              setAnswers((prev) => ({ ...prev, [`task_${taskIndex}`]: e.target.value }))
            }
          />
          {currentOut && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-warning">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              {t('tcf.wordRangeWarning', { min: task.word_limit_min, max: task.word_limit_max })}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            {!isLast && (
              <Button variant="accent" size="md" onClick={() => setTaskIndex((i) => i + 1)}>
                {tc('nextTask')} →
              </Button>
            )}
            <Button
              variant={isLast ? 'default' : 'outline'}
              size="md"
              onClick={() => setShowConfirm(true)}
              loading={isSubmitting}
            >
              {tc('submit')}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        variant="warning"
        title={tc('confirmSubmit')}
        description={confirmDescription}
        confirmText={tc('confirm')}
        cancelText={tc('cancel')}
        onConfirm={handleSubmit}
        isLoading={isSubmitting}
      />

      <DevSkipButton
        label={isLast ? 'Skip to submit' : 'Skip task'}
        onClick={handleDevSkip}
        disabled={isSubmitting}
      />
    </div>
  );
}
