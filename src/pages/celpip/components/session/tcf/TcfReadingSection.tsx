import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { McqQuestion } from '../McqQuestion';
import { QuestionDots } from '../QuestionDots';
import { DevSkipButton } from '../DevSkipButton';
import { ConfirmDialog } from '../ConfirmDialog';
import { ExamText } from '../ExamText';
import { saveDraft } from '../../../services/examDraft';
import { formatClock, initialTimeLeft, itemContent } from '../../../utils/examClocks';
import type { ExamSectionDraft, ReadingContent } from '../../../types';
import { TcfLevelBadge, useLoadedDraft } from './tcfShared';

interface Props {
  sessionId: string;
  content: ReadingContent;
  timeLimitSec: number;
  /** Practice: the clock stops while the learner is away. A full sitting keeps the wall clock. */
  pauseClockWhileAway?: boolean;
  /** Resolves false when the server refused the section, so the dialog stays open on the error. */
  onSubmit: (answers: Record<string, number>, timeSpent: number) => Promise<boolean | void> | void;
  isSubmitting: boolean;
}

/**
 * TCF Compréhension écrite: 39 items, each a short document and one question.
 * Free navigation between items, one section clock.
 */
export function TcfReadingSection(props: Props) {
  const { ready, draft } = useLoadedDraft(props.sessionId, 'reading');
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
  timeLimitSec,
  pauseClockWhileAway = false,
  onSubmit,
  isSubmitting,
  draft,
}: Props & { draft: ExamSectionDraft | null }) {
  const { t } = useTranslation('exam');
  const { t: tc } = useTranslation('celpip');
  const items = content.parts;
  const [itemIndex, setItemIndex] = useState(draft?.partIndex ?? 0);
  const [answers, setAnswers] = useState<Record<string, number>>(
    () => (draft?.answers as Record<string, number> | undefined) ?? {},
  );
  const [timeLeft, setTimeLeft] = useState(() =>
    initialTimeLeft(draft, timeLimitSec, pauseClockWhileAway, Date.now()),
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [startedAt] = useState(() => draft?.sectionStartedAt || Date.now());
  const activeSecRef = useRef(timeLimitSec - timeLeft);
  const autoSubmitRef = useRef(false);
  const progressRef = useRef({ itemIndex, answers });

  useEffect(() => {
    progressRef.current = { itemIndex, answers };
  }, [itemIndex, answers]);

  const persist = useCallback(() => {
    void saveDraft(sessionId, 'reading', {
      partIndex: progressRef.current.itemIndex,
      currentQuestion: 0,
      answers: progressRef.current.answers,
      sectionStartedAt: startedAt,
      activeSec: activeSecRef.current,
    });
  }, [sessionId, startedAt]);

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
  }, [itemIndex, answers, persist]);

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

  const item = items[itemIndex];
  if (!item) return null;
  const meta = itemContent(item);
  const question = item.questions[0];
  const key = `part_${itemIndex}_q_0`;
  const answered = new Set(
    items.map((_, i) => i).filter((i) => answers[`part_${i}_q_0`] !== undefined),
  );
  const isLast = itemIndex >= items.length - 1;
  const unanswered = items.length - answered.size;

  const handleDevSkip = () => {
    if (answers[key] === undefined) setAnswers((prev) => ({ ...prev, [key]: 0 }));
    if (!isLast) setItemIndex((i) => i + 1);
    else setShowConfirm(true);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-sm font-medium tabular-nums text-foreground">
          {t('tcf.itemOf', { current: itemIndex + 1, total: items.length })}
          <TcfLevelBadge level={meta.level} />
        </span>
        <span
          data-testid="tcf-clock"
          className={`font-mono text-sm font-bold ${timeLeft < 300 ? 'text-error' : 'text-foreground'}`}
        >
          {formatClock(timeLeft)}
        </span>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">
          {answered.size}/{items.length}
        </span>
      </div>

      <div className="shrink-0 border-b border-border px-4">
        <QuestionDots
          total={items.length}
          current={itemIndex}
          answered={answered}
          onJump={setItemIndex}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          lang="fr"
          className="w-full overflow-y-auto border-b border-border p-4 lg:min-h-0 lg:w-1/2 lg:flex-1 lg:border-b-0 lg:border-e"
        >
          {meta.documentKind && (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-muted-foreground">
              {meta.documentKind}
            </p>
          )}
          {meta.title && <h3 className="mb-3 font-semibold text-foreground">{meta.title}</h3>}
          <div className="rounded-[9px] border border-border bg-muted/40 p-4">
            <ExamText base={14} className="whitespace-pre-line text-foreground">
              {meta.document ?? ''}
            </ExamText>
          </div>
        </div>

        <div className="flex w-full flex-col lg:min-h-0 lg:w-1/2 lg:flex-1">
          <div className="p-4 lg:flex-1 lg:overflow-y-auto" lang="fr">
            {question && (
              <McqQuestion
                questionText={question.question}
                options={question.options}
                selectedIndex={answers[key] ?? null}
                onChange={(i) => setAnswers((prev) => ({ ...prev, [key]: i }))}
                questionNumber={itemIndex + 1}
              />
            )}
          </div>
          <div className="flex shrink-0 justify-between gap-2 border-t border-border bg-card px-4 py-3">
            <Button
              variant="outline"
              size="md"
              onClick={() => setItemIndex((i) => Math.max(0, i - 1))}
              disabled={itemIndex === 0}
              aria-label={tc('previous', 'Previous')}
            >
              ←
            </Button>
            <div className="inline-flex items-center gap-2">
              {!isLast && (
                <Button variant="outline" size="md" onClick={() => setShowConfirm(true)}>
                  {tc('submit')}
                </Button>
              )}
              {isLast ? (
                <Button size="md" onClick={() => setShowConfirm(true)} loading={isSubmitting}>
                  {tc('submit')}
                </Button>
              ) : (
                <Button variant="accent" size="md" onClick={() => setItemIndex((i) => i + 1)}>
                  {tc('next')} →
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        variant="warning"
        title={tc('confirmSubmit')}
        description={
          unanswered > 0
            ? t('tcf.unansweredWarning', { count: unanswered })
            : tc('confirmSubmitMessage')
        }
        confirmText={tc('confirm')}
        cancelText={tc('cancel')}
        onConfirm={handleSubmit}
        isLoading={isSubmitting}
      />

      <DevSkipButton label="Skip question" onClick={handleDevSkip} disabled={isSubmitting} />
    </div>
  );
}
