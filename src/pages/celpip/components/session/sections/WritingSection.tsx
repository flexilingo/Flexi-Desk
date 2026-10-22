import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '../ConfirmDialog';
import { WordCount } from '../WordCount';
import { DevSkipButton } from '../DevSkipButton';
import { LookupText } from '../WordLookup';
import { ExamText } from '../ExamText';
import { useExamFontScale } from '../ExamSettingsContext';
import type { WritingPrompts } from '../../../types';
import { saveDraft, loadDraft, elapsedSince, remainingFrom } from '../../../services/examDraft';
import { restoreWriting } from '../../../utils/writingResume';

interface WritingSectionProps {
  sessionId: string;
  prompts: WritingPrompts;
  onSubmit: (answers: Record<string, string>, timeSpent: number) => void;
  isSubmitting: boolean;
  /** Untimed relaxed mode: no countdown, prompts word-clickable */
  learningMode?: boolean;
  /** Practice: a task's clock counts only the time spent on it, not the time away. */
  pauseClockWhileAway?: boolean;
}

export function WritingSection({
  sessionId,
  prompts,
  onSubmit,
  isSubmitting,
  learningMode = false,
  pauseClockWhileAway = false,
}: WritingSectionProps) {
  const { t } = useTranslation('celpip');
  const [loaded, setLoaded] = useState(false);
  const [taskIndex, setTaskIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [showTaskTransition, setShowTaskTransition] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const startTime = useRef<number>(0);
  const taskStartedAt = useRef<number>(0);
  // Seconds the current task's clock has run (practice: carried across a return).
  const activeSecRef = useRef(0);

  const currentTask = prompts.tasks[taskIndex];

  const essayFontSize = Math.round(14 * useExamFontScale() * 10) / 10;

  // Empty string = 0 words (a bare split would report 1).
  const countWords = (text: string) => (text.trim() === '' ? 0 : text.trim().split(/\s+/).length);
  const allTasksWordCount = prompts.tasks.map((task, i) => {
    const text = answers[`task_${i}`] || '';
    const count = countWords(text);
    return {
      i,
      count,
      min: task.word_limit_min,
      max: task.word_limit_max,
      over: count > task.word_limit_max,
    };
  });
  const hasWordCountWarning = allTasksWordCount.some((task) => task.over);

  // Restore draft on mount. The section opens straight from the draft (task,
  // answers, clock) behind the spinner; nothing here ever submits, so an empty
  // reopened page is never handed in by a clock check.
  useEffect(() => {
    let cancelled = false;
    loadDraft(sessionId, 'writing').then((draft) => {
      if (cancelled) return;
      const restored = restoreWriting(draft, prompts.tasks, pauseClockWhileAway, Date.now());
      setTaskIndex(restored.taskIndex);
      setAnswers(restored.answers);
      setTimeLeft(restored.timeLeft);
      activeSecRef.current = restored.activeSec;
      startTime.current = draft?.sectionStartedAt || Date.now();
      taskStartedAt.current = draft?.taskStartedAt ?? draft?.sectionStartedAt ?? Date.now();
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, prompts.tasks]);

  // Per-task countdown. NO auto-submit: writing is always finished manually.
  // A full sitting recomputes from the task's epoch start (a suspended app never
  // gains free time); a practice counts only the seconds spent. Learning mode is untimed.
  useEffect(() => {
    if (learningMode || !loaded) return;
    const interval = setInterval(() => {
      const task = prompts.tasks[taskIndex];
      if (!task) return;
      const limit = task.time_limit_minutes * 60;
      if (pauseClockWhileAway) {
        activeSecRef.current = Math.min(limit, activeSecRef.current + 1);
        setTimeLeft(limit - activeSecRef.current);
      } else {
        setTimeLeft(remainingFrom(taskStartedAt.current, limit));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [learningMode, loaded, taskIndex, prompts.tasks, pauseClockWhileAway]);

  // Save draft on state changes.
  useEffect(() => {
    if (!loaded || startTime.current === 0) return;
    saveDraft(sessionId, 'writing', {
      partIndex: 0,
      currentQuestion: 0,
      taskIndex,
      answers,
      sectionStartedAt: startTime.current,
      taskStartedAt: taskStartedAt.current,
      activeSec: activeSecRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIndex, answers, loaded]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleNextTask = () => {
    setShowTaskTransition(false);
    const nextIndex = taskIndex + 1;
    setTaskIndex(nextIndex);
    // A new task restarts the per-task clock.
    taskStartedAt.current = Date.now();
    activeSecRef.current = 0;
    const nextTask = prompts.tasks[nextIndex];
    if (nextTask) setTimeLeft(nextTask.time_limit_minutes * 60);
  };

  const handleSubmit = () => {
    const timeSpent = elapsedSince(startTime.current);
    // The draft stays until the server holds the answers (the store clears it).
    onSubmit(answers, timeSpent);
    setShowConfirm(false);
  };

  // DEV ONLY — fill a placeholder answer for the current task, then move on (or
  // open the final submit confirm on the last one).
  const handleDevSkip = () => {
    if (!(answers[`task_${taskIndex}`] || '').trim()) {
      setAnswers((prev) => ({
        ...prev,
        [`task_${taskIndex}`]:
          'This is a dev skip placeholder answer used only for end-to-end flow testing of the exam pipeline.',
      }));
    }
    if (taskIndex < prompts.tasks.length - 1) {
      handleNextTask();
    } else {
      setShowConfirm(true);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!currentTask) return null;

  const bulletPoints: string[] = currentTask.bullet_points ?? [];
  const taskRec = currentTask as unknown as Record<string, unknown>;
  const surveyQuestion = taskRec.question as string | undefined;
  const optionA = taskRec.option_a as string | undefined;
  const optionB = taskRec.option_b as string | undefined;
  const pointsToAddress = taskRec.points_to_address as string[] | undefined;
  const bulletPointsEl =
    bulletPoints.length > 0 ? (
      <div className="mb-3">
        <p className="text-sm font-medium text-foreground mb-1.5">In your email:</p>
        <ul className="space-y-1.5">
          {bulletPoints.map((bp, i) => (
            <ExamText key={i} as="li" base={14} className="flex gap-2 text-foreground">
              <span className="text-primary font-bold shrink-0">•</span>
              <LookupText text={bp} />
            </ExamText>
          ))}
        </ul>
      </div>
    ) : null;
  const currentText = answers[`task_${taskIndex}`] || '';

  // Final submit warns when any task is over-length, listing the offenders.
  const wordCountWarningDesc = hasWordCountWarning ? (
    <span>
      {t('confirmSubmitMessage')}
      <span className="mt-2 flex items-start gap-1.5 text-accent">
        <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          {allTasksWordCount
            .filter((task) => task.over)
            .map((task) => `Task ${task.i + 1}: ${task.count} words (max ${task.max})`)
            .join(', ')}{' '}
          — CELPIP penalizes over-length responses.
        </span>
      </span>
    </span>
  ) : (
    t('confirmSubmitMessage')
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border">
        <div className="flex gap-1">
          {prompts.tasks.map((_, i) => (
            <span
              key={i}
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                i === taskIndex
                  ? 'bg-primary text-primary-foreground'
                  : i < taskIndex
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {t('task')} {i + 1}
            </span>
          ))}
        </div>
        {learningMode ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-[6px] bg-success/10 text-success">
            {t('learningModeBadge')}
          </span>
        ) : (
          <span
            className={`text-sm font-mono font-bold ${timeLeft < 120 ? 'text-error' : 'text-foreground'}`}
          >
            {formatTime(timeLeft)}
          </span>
        )}
        <WordCount
          text={currentText}
          min={currentTask.word_limit_min}
          max={currentTask.word_limit_max}
        />
      </div>

      {/* Content */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Prompt */}
        <div className="w-full md:w-1/2 overflow-y-auto p-4 border-b md:border-b-0 md:border-r border-border bg-muted">
          <h3 className="font-semibold text-foreground mb-3">{currentTask.title}</h3>

          {/* Task 1: Email */}
          {currentTask.scenario && (
            <ExamText base={14} className="text-foreground mb-3">
              <LookupText text={currentTask.scenario} />
            </ExamText>
          )}
          {currentTask.recipient && (
            <p className="text-sm text-muted-foreground mb-3">
              <span className="font-medium">To:</span> {currentTask.recipient}
              {currentTask.relationship && (
                <span className="ml-2 text-xs">({currentTask.relationship})</span>
              )}
            </p>
          )}
          {bulletPointsEl}

          {/* Task 2: Survey */}
          {surveyQuestion && (
            <ExamText base={14} className="text-foreground mb-3 font-medium">
              <LookupText text={surveyQuestion} />
            </ExamText>
          )}
          {optionA && (
            <div className="space-y-2 mb-3">
              <div className="bg-card border border-border rounded-lg p-3">
                <p className="text-xs font-medium text-primary mb-1">Option A</p>
                <ExamText base={14} className="text-foreground">
                  <LookupText text={optionA} />
                </ExamText>
              </div>
              <div className="bg-card border border-border rounded-lg p-3">
                <p className="text-xs font-medium text-primary mb-1">Option B</p>
                <ExamText base={14} className="text-foreground">
                  <LookupText text={optionB ?? ''} />
                </ExamText>
              </div>
            </div>
          )}
          {pointsToAddress && pointsToAddress.length > 0 && (
            <div className="mb-3">
              <p className="text-sm font-medium text-foreground mb-1.5">Points to address:</p>
              <ul className="space-y-1.5">
                {pointsToAddress.map((p, i) => (
                  <ExamText key={i} as="li" base={14} className="flex gap-2 text-foreground">
                    <span className="text-primary font-bold shrink-0">•</span>
                    <LookupText text={p} />
                  </ExamText>
                ))}
              </ul>
            </div>
          )}

          {/* Fallback: plain prompt */}
          {currentTask.prompt && !currentTask.scenario && !surveyQuestion && (
            <ExamText base={14} lineFactor={1.6} className="text-foreground">
              <LookupText text={currentTask.prompt} />
            </ExamText>
          )}

          <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
            {currentTask.word_limit_min}–{currentTask.word_limit_max} words &middot;{' '}
            {currentTask.time_limit_minutes} minutes
          </div>
        </div>

        {/* Textarea */}
        <div className="w-full md:w-1/2 flex flex-col p-4">
          <textarea
            className="flex-1 resize-none bg-card border border-border rounded-lg p-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[200px] md:min-h-0"
            // A candidate spends ~27 minutes in this box; it honours the exam's
            // text-size setting like every other piece of content.
            style={{
              fontSize: `${essayFontSize}px`,
              lineHeight: `${Math.round(essayFontSize * 1.5)}px`,
            }}
            placeholder={t('writingPlaceholder')}
            value={currentText}
            onChange={(e) =>
              setAnswers((prev) => ({ ...prev, [`task_${taskIndex}`]: e.target.value }))
            }
          />
          <div className="flex justify-end mt-3">
            {taskIndex < prompts.tasks.length - 1 ? (
              <Button onClick={() => setShowTaskTransition(true)}>
                {t('nextTask')} <span className="rtl:hidden">→</span>
              </Button>
            ) : (
              <Button onClick={() => setShowConfirm(true)} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('submit')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Task transition confirm */}
      <ConfirmDialog
        open={showTaskTransition}
        onOpenChange={setShowTaskTransition}
        variant="info"
        title={`${t('task')} ${taskIndex + 1} → ${t('task')} ${taskIndex + 2}`}
        description={t('confirmSubmitMessage')}
        confirmText={t('confirm')}
        cancelText={t('cancel')}
        onConfirm={handleNextTask}
      />

      {/* Final submit confirm */}
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        variant="warning"
        title={t('confirmSubmit')}
        description={wordCountWarningDesc}
        confirmText={t('confirm')}
        cancelText={t('cancel')}
        onConfirm={handleSubmit}
        isLoading={isSubmitting}
      />

      <DevSkipButton
        label={taskIndex < prompts.tasks.length - 1 ? 'Skip task' : 'Skip to submit'}
        onClick={handleDevSkip}
        disabled={isSubmitting}
      />
    </div>
  );
}
