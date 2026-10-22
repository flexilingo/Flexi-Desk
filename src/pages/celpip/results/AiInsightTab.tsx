import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FileQuestion, ChevronLeft, ChevronRight, Loader2, MicOff, PencilOff } from 'lucide-react';
import type {
  SectionResult,
  AiTaskFeedback,
  InsightSkillState,
  SpeakingTaskContent,
  BandModelAnswer,
  CelpipServedTask,
  TcfServedTask,
} from '../types';
import { ModelAnswerLadder } from './ModelAnswerLadder';
import { TcfModelAnswersBlock, tcfTaskNclc } from './TcfExplanations';
import { LookupText } from '../components/session/WordLookup';
import { MediaLockNote, TaskRecordingPlayer } from './TaskRecordingPlayer';
import { ClampText } from './ClampText';
import { ScoringProgressPanel } from './ScoringProgressPanel';

const CARD = 'rounded-[9px] border border-border bg-card shadow-sm';

/** A task picture; a click opens it full size. */
function LightboxImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full overflow-hidden rounded-[9px] border border-border"
      >
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

interface AiInsightTabProps {
  result: SectionResult;
  sessionId: string;
  taskLabel: string;
  insightState?: InsightSkillState;
  /** The section's overall score, shown at the end of the task tab row. */
  skillLine?: ReactNode;
  /** One task's AI corrections, shown as that task's Corrections part. */
  renderTaskInsight?: (taskIndex: number) => ReactNode;
  /** Speaking only: the prompt and picture each task was answered against. */
  speakingTasks?: SpeakingTaskContent[];
  /** Speaking only: this result is not read in full (not Pro, and not one of a
   * free account's 2 full results this month), so the server sent neither the
   * pictures nor the recording paths. An explicit flag, because "no picture"
   * is also the normal state of the four text-only tasks. */
  mediaLocked?: boolean;
  /** What the lock says; defaults to CELPIP's "the picture and your recording". */
  mediaLockedText?: string;
  /** Speaking only: pre-authored answers per task position, CLB 7/9 locked for free. */
  modelAnswers?: Record<string, BandModelAnswer[]>;
  /** TCF only (absent for CELPIP): model answers at NCLC 5 and 7 per task position. */
  tcfModelAnswers?: Record<string, TcfServedTask>;
  /** CELPIP only: CLB 5/7/9 answers and the steps per task position — the TCF block, CLB bands.
   * Where a task has one, it replaces the older speaking ladder (`modelAnswers`). */
  celpipModelAnswers?: Record<string, CelpipServedTask>;
  /** Exam profile: band name on the task pill (CLB / NCLC). */
  bandLabel?: string;
  /** Exam profile: the examiner's criterion scale (CLB 12, TCF 20). */
  criterionMax?: number;
  /** Exam profile: where the examiner's task_index starts (CELPIP 0, TCF 1). */
  taskIndexBase?: 0 | 1;
  /** lang attribute for the learner's own answer and the model answer. */
  contentLang?: string;
}

// Literal grid classes for the part switcher (content scanner needs them whole).
const VIEW_COLS: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };

/** The parts of one task — only one is open at a time. */
type TaskView = 'answer' | 'feedback' | 'fixes' | 'model';

/**
 * Writing/speaking scored-answer review. Each task is a sub-tab (speaking has 8
 * tasks — one at a time keeps it scannable); the deeper AI insight (corrections,
 * vocab upgrades) rides alongside as a trailing "Insight" pill.
 *
 * Inside a task the examiner's summary and the criterion scores stay on top, and
 * the rest is split into Your answer · Feedback · Model answer, one at a time:
 * opened all at once they made a single task three screens long on a phone.
 */
export function AiInsightTab({
  result,
  sessionId,
  taskLabel,
  insightState,
  renderTaskInsight,
  skillLine,
  speakingTasks,
  mediaLocked,
  mediaLockedText,
  modelAnswers,
  tcfModelAnswers,
  celpipModelAnswers,
  bandLabel = 'CLB',
  criterionMax = 12,
  taskIndexBase = 0,
  contentLang,
}: AiInsightTabProps) {
  const { t, i18n } = useTranslation('exam');
  const [active, setActive] = useState(0);
  // Kept across tasks, so moving on to the next task stays on the same part.
  const [view, setView] = useState<TaskView>('feedback');
  const rootRef = useRef<HTMLDivElement>(null);
  const tasks: AiTaskFeedback[] = result.ai_feedback?.tasks ?? [];
  const isSpeak = result.section_type === 'speaking';
  const userAnswers = (result.answers || {}) as Record<string, string>;
  const userTranscripts = (result.transcripts || {}) as Record<string, string>;
  // Storage object paths, not URLs — see TaskRecordingPlayer.
  const recordingPaths = (result.recording_paths || {}) as Record<string, string>;

  // The task's own number (CELPIP's 1–8, TCF's Tâche 1–3) and, where the exam
  // has fixed task types, its name — "Giving Advice" says more than "Task 1".
  // A task with no stored index (older TCF writing) counts by its position.
  const numberOf = (i: number) => {
    const index = tasks[i]?.task_index;
    return Number.isInteger(index) ? (index as number) + 1 - taskIndexBase : i + 1;
  };
  const nameOf = (i: number) => {
    const key = `results.speakingTaskNames.${numberOf(i)}`;
    return isSpeak && bandLabel === 'CLB' && i18n.exists(key, { ns: 'exam' })
      ? t(key)
      : `${taskLabel} ${numberOf(i)}`;
  };

  if (tasks.length === 0) {
    // The results page only renders once the session is `completed`, so a
    // section with no scored tasks AND nothing submitted was simply never
    // answered — show an honest empty state instead of a spinner that would
    // otherwise "load" forever. Only show the progress panel when there IS a
    // submission still awaiting its score.
    const answerCount = Object.keys(userAnswers).length;
    const hasSubmission = answerCount > 0 || Object.keys(userTranscripts).length > 0;
    if (!hasSubmission) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="w-12 h-12 rounded-[14px] bg-muted border border-border flex items-center justify-center">
            <FileQuestion className="w-5 h-5 text-caption" />
          </div>
          <p className="text-[13px] text-muted-foreground max-w-xs leading-relaxed">
            {t('noResponseSubmitted')}
          </p>
        </div>
      );
    }
    return (
      <ScoringProgressPanel
        skill={isSpeak ? 'speaking' : 'writing'}
        sessionId={sessionId}
        state={result.scoring_state}
        answerCount={answerCount || Object.keys(userTranscripts).length}
      />
    );
  }

  // Previous / next at the foot of a task, then back up to the picker.
  const goTo = (next: number) => {
    setActive(next);
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // The task's score on its pill: the stored band, else (TCF Québec / IRN,
  // which store none) the examiner's score out of 20.
  const scoreOf = (task: AiTaskFeedback): string | null =>
    typeof task.clb_score === 'number'
      ? String(task.clb_score)
      : typeof task.score === 'number'
        ? `${task.score}/20`
        : null;
  const activeName = nameOf(active);
  const activeIsNamed = activeName !== `${taskLabel} ${numberOf(active)}`;

  return (
    <div ref={rootRef} className="flex flex-col gap-4 scroll-mt-32 md:scroll-mt-20">
      {/* Task tabs: one pill per task with its score, the section's overall
          score trailing the row — the same pills as the listening/reading
          review, and the task's content full width below (owner, 2026-10-16:
          one style for every part of the results). Eight CELPIP speaking tasks
          wrap onto a second row on a phone. */}
      {tasks.length > 1 && (
        <div className="flex flex-col gap-2">
          <div role="tablist" className="flex items-center gap-1.5 flex-wrap">
            {tasks.map((task, i) => {
              const on = i === active;
              const score = scoreOf(task);
              return (
                <button
                  key={numberOf(i)}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  title={nameOf(i)}
                  onClick={() => setActive(i)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12px] font-semibold border whitespace-nowrap transition-colors ${
                    on
                      ? 'bg-primary text-white border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {taskLabel} {numberOf(i)}
                  {score != null && (
                    <span
                      className={`text-[10.5px] tabular-nums font-bold px-1.5 py-[1px] rounded-full ${
                        on ? 'bg-card/20 text-white' : 'bg-muted text-foreground'
                      }`}
                    >
                      {score}
                    </span>
                  )}
                </button>
              );
            })}
            {skillLine && (
              <span className="ms-auto inline-flex items-center gap-2 min-w-0 max-w-full ps-1">
                {skillLine}
              </span>
            )}
          </div>
          {/* CELPIP speaking tasks have names ("Giving Advice"): the pill says
              only the number, so the open task's name sits under the row. */}
          {activeIsNamed && (
            <p className="px-1 text-[15px] font-bold text-foreground leading-snug">{activeName}</p>
          )}
        </div>
      )}

      {tasks.map((task, i) => {
        if (i !== active) return null;
        // taskIdx labels the task (official CELPIP number); the answer itself
        // is keyed by the task's position in this session — in practice the
        // two differ. See core answer-keys.ts.
        const taskIdx = task.task_index ?? i;
        const userText = isSpeak
          ? (task.transcript ?? userTranscripts[`task_${i}`] ?? '')
          : (userAnswers[`task_${i}`] ?? '');
        const overallComment = task.overall_comment ?? task.comment ?? '';
        const criteriaEntries = Object.entries(task.criteria);
        // The answer is keyed by position in this session, so the picture and
        // the recording are looked up by the same `i`, never by task_index.
        const speakingTask = isSpeak ? speakingTasks?.find((s) => s.task_index === i) : undefined;
        const taskImages = [
          speakingTask?.image_url,
          speakingTask?.option_a_image,
          speakingTask?.option_b_image,
        ].filter((src): src is string => Boolean(src));
        const recordingPath = isSpeak ? recordingPaths[`task_${i}`] : undefined;
        // Same position key as the recording: the pre-authored bands for this task.
        const ladder = isSpeak ? modelAnswers?.[String(i)] : undefined;
        // CELPIP: the same position key — CLB 5 / 7 / 9 and the steps between,
        // shown exactly as TCF's. Where it exists the older ladder steps aside.
        const celpipTask = celpipModelAnswers?.[String(i)];
        const hasCelpipModel = Boolean(celpipTask && celpipTask.bands?.length > 0);
        const hasLadder = !hasCelpipModel && Boolean(ladder && ladder.length > 0);
        // TCF: the same position key — NCLC 5 / 7 answers and the steps between.
        const tcfTask = tcfModelAnswers?.[String(i)];
        const hasTcfModel = Boolean(tcfTask && tcfTask.bands?.length > 0);
        const servedTask = hasTcfModel ? tcfTask : hasCelpipModel ? celpipTask : undefined;
        // The live single example stays for tasks with no authored set
        // (making_predictions, or not generated yet). The server strips it
        // from free accounts, so it only ever shows for Pro.
        const hasModel = hasLadder || Boolean(servedTask) || Boolean(task.model_answer);
        const shownView: TaskView =
          (view === 'model' && !hasModel) || (view === 'fixes' && !renderTaskInsight)
            ? 'feedback'
            : view;

        const views: { key: TaskView; label: string }[] = [
          { key: 'answer', label: t('results.viewAnswer') },
          { key: 'feedback', label: t('results.viewFeedback') },
          ...(renderTaskInsight ? [{ key: 'fixes' as const, label: t('results.viewFixes') }] : []),
          ...(hasModel ? [{ key: 'model' as const, label: t('results.viewModel') }] : []),
        ];
        const insightBusy = insightState === 'generating' || insightState === 'pending';

        const prev = i > 0 ? i - 1 : null;
        const next = i < tasks.length - 1 ? i + 1 : null;
        const labelOf = (n: number) => `${taskLabel} ${numberOf(n)}`;

        return (
          <div key={taskIdx} className={`${CARD} overflow-hidden`}>
            {/* A silent recording is not an answer: say why the score is the
                  minimum and what to do, instead of only the examiner's critique. */}
            {task.no_speech && (
              <div
                role="status"
                className="flex items-start gap-2 px-4 py-3 bg-warning/[0.10] border-b border-warning/30 text-[12.5px] leading-relaxed text-foreground"
              >
                <MicOff className="w-3.5 h-3.5 mt-0.5 text-warning shrink-0" />
                <span>
                  <span className="font-bold">{t('results.noSpeechTitle')}</span>{' '}
                  {t('results.noSpeechBody')}
                </span>
              </div>
            )}
            {/* Same for a writing task submitted with nothing in it (core
                  writing-no-answer): the minimum, never sent to the examiner. */}
            {task.no_answer && (
              <div
                role="status"
                className="flex items-start gap-2 px-4 py-3 bg-warning/[0.10] border-b border-warning/30 text-[12.5px] leading-relaxed text-foreground"
              >
                <PencilOff className="w-3.5 h-3.5 mt-0.5 text-warning shrink-0" />
                <span>
                  <span className="font-bold">{t('results.noAnswerTitle')}</span>{' '}
                  {t('results.noAnswerBody')}
                </span>
              </div>
            )}
            {/* Answer · Feedback · Fixes · Sample — the card's own tabs, an
                  olive underline under the open one, as in the page's tab bar. */}
            <div
              role="tablist"
              className={`grid ${VIEW_COLS[views.length] ?? 'grid-cols-4'} border-b border-border px-1`}
            >
              {views.map(({ key, label }) => {
                const on = shownView === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setView(key)}
                    className={`inline-flex items-center justify-center gap-1 h-11 -mb-px border-b-2 text-[13px] min-[360px]:text-[14px] font-semibold whitespace-nowrap transition-colors ${
                      on
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-caption hover:text-muted-foreground'
                    }`}
                  >
                    {label}
                    {key === 'fixes' && insightBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                  </button>
                );
              })}
            </div>

            <div className="p-4 sm:p-5 flex flex-col gap-4">
              {shownView === 'answer' && (
                <div className="flex flex-col gap-4">
                  {isSpeak && mediaLocked && (
                    <MediaLockNote text={mediaLockedText ?? t('results.proOnlyMedia')} />
                  )}

                  {taskImages.length > 0 && (
                    <div className="flex flex-wrap gap-2.5">
                      {taskImages.map((src) => (
                        <div key={src} className="w-[132px] sm:w-[220px]">
                          <LightboxImage src={src} alt={t('results.taskPicture')} />
                        </div>
                      ))}
                    </div>
                  )}

                  {recordingPath && <TaskRecordingPlayer path={recordingPath} />}

                  {userText ? (
                    <div>
                      <p className="text-[11px] font-semibold text-caption uppercase tracking-[.1em] mb-1.5">
                        {isSpeak ? t('results.yourTranscript') : t('results.yourAnswer')}
                      </p>
                      <ClampText
                        lines={5}
                        lang={contentLang}
                        className="text-[14.5px] text-foreground leading-relaxed whitespace-pre-wrap"
                      >
                        <LookupText text={userText} />
                      </ClampText>
                    </div>
                  ) : (
                    !recordingPath && (
                      <p className="text-[12.5px] text-caption">{t('noResponseSubmitted')}</p>
                    )
                  )}
                </div>
              )}

              {shownView === 'feedback' && overallComment && (
                <div>
                  <p className="text-[11px] font-semibold text-caption uppercase tracking-[.1em] mb-1.5">
                    {t('results.examinerNote')}
                  </p>
                  <ClampText lines={4} className="text-[14.5px] text-foreground leading-relaxed">
                    <LookupText text={overallComment} />
                  </ClampText>
                </div>
              )}

              {shownView === 'feedback' && criteriaEntries.length > 0 && (
                <div
                  className={`divide-y divide-border ${overallComment ? 'pt-4 border-t border-border' : ''}`}
                >
                  {criteriaEntries.map(([critKey, crit]) => (
                    <CriterionRow
                      key={critKey}
                      name={critKey}
                      score={crit.score}
                      comment={crit.comment}
                      max={criterionMax}
                    />
                  ))}
                </div>
              )}

              {shownView === 'fixes' && renderTaskInsight?.(taskIdx)}

              {shownView === 'model' && servedTask && (
                <TcfModelAnswersBlock
                  key={taskIdx}
                  task={servedTask}
                  taskBand={tcfTaskNclc(task)}
                  exam={hasTcfModel ? 'tcf' : 'celpip'}
                />
              )}

              {shownView === 'model' && hasLadder && (
                <ModelAnswerLadder key={taskIdx} bands={ladder!} taskClb={task.clb_score} />
              )}

              {shownView === 'model' && !hasLadder && task.model_answer && (
                <div className={servedTask ? 'pt-4 border-t border-border' : undefined}>
                  {/* Under the authored band 5 / 7 / 9 answers, the examiner's own
                        example needs its name; alone it renders as it always did. */}
                  {servedTask && (
                    <p className="text-[11px] font-semibold text-caption uppercase tracking-[.1em] mb-1.5">
                      {t('results.tcfHelp.examinerModel')}
                    </p>
                  )}
                  <ClampText
                    lines={6}
                    lang={contentLang}
                    className="text-[14.5px] text-foreground leading-relaxed whitespace-pre-wrap"
                  >
                    <LookupText text={task.model_answer} />
                  </ClampText>
                </div>
              )}
            </div>

            {(prev !== null || next !== null) && (
              <div className="px-4 sm:px-5 py-3 border-t border-border flex items-center justify-between gap-3">
                {prev !== null ? (
                  <button
                    type="button"
                    onClick={() => goTo(prev)}
                    className="inline-flex items-center gap-1 h-9 px-2 -ms-2 rounded-[9px] text-[13.5px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                    {labelOf(prev)}
                  </button>
                ) : (
                  <span />
                )}
                {next !== null && (
                  <button
                    type="button"
                    onClick={() => goTo(next)}
                    className="inline-flex items-center gap-1 h-9 px-3.5 rounded-[9px] text-[13.5px] font-semibold text-white bg-accent hover:bg-accent transition-colors"
                  >
                    {labelOf(next)}
                    <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── CriterionRow ──────────────────────────────────────────────────────────────

interface CriterionRowProps {
  name: string;
  score: number;
  comment?: string;
  /** Scale of `score`: CLB 12 (default) or TCF 20. */
  max?: number;
}

/**
 * One row of the Feedback list — a divider, not a card. The bars are already in
 * the score strip above, so a row is the examiner's words and the score only.
 */
function CriterionRow({ name, score, comment, max = 12 }: CriterionRowProps) {
  const { t, i18n } = useTranslation('exam');
  const critKey = `results.criteria.${name}`;
  const label = i18n.exists(critKey, { ns: 'exam' }) ? t(critKey) : name.replace(/_/g, ' ');
  return (
    <div className="py-3 first:pt-0 last:pb-0 flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <span className="text-[14.5px] font-semibold text-foreground flex-1 min-w-0">{label}</span>
        <span className="text-[14.5px] font-bold tabular-nums text-foreground">
          {score}
          <span className="text-[11px] font-normal text-caption"> / {max}</span>
        </span>
      </div>
      {comment && (
        <p dir="auto" className="text-[13.5px] text-muted-foreground leading-relaxed">
          <LookupText text={comment} />
        </p>
      )}
    </div>
  );
}
