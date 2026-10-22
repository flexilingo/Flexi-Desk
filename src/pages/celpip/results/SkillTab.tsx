import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type {
  ExamInsight,
  InsightOrigin,
  InsightSkill,
  InsightSkillState,
  SectionResult,
  ListeningContent,
  ReadingContent,
  SpeakingTaskContent,
  BandModelAnswer,
  CelpipModelAnswers,
  TcfAccess,
  TcfExplanations,
  TcfModelAnswers,
} from '../types';
import { SECTION_META, CLB_SCALE, type ScoreScale } from './shared';
import { McqResultTab } from './McqResultTab';
import { AiInsightTab } from './AiInsightTab';
import { SkillInsightPanel, InsightOriginBadge } from './SkillInsightPanel';
import { VsAvgBadge } from './HeroScoreCard';

type Skill = Exclude<InsightSkill, 'summary'>;

interface SkillTabProps {
  skill: Skill;
  label: string;
  score: number | null;
  avg: number | null;
  result: SectionResult;
  mcqContent: ListeningContent | ReadingContent | null;
  insightState: InsightSkillState;
  insight: Partial<ExamInsight>;
  /** Where the insight was generated (this device, own key, cloud): drives the error path and the badge. */
  insightOrigin: InsightOrigin;
  onRetryInsight: () => void;
  yourAnswerLabel: string;
  taskLabel: string;
  /** Speaking only: the prompt and picture each task was answered against. */
  speakingTasks?: SpeakingTaskContent[];
  /** Speaking only: not a full result, so the pictures and recordings were withheld. */
  mediaLocked?: boolean;
  /** Speaking only: pre-authored model answers per task position. */
  modelAnswers?: Record<string, BandModelAnswer[]>;
  /** TCF only (absent for CELPIP): CO/CE explanations by item position. */
  tcfExplanations?: TcfExplanations;
  /** TCF only (absent for CELPIP): EE/EO model answers by task position. */
  tcfModelAnswers?: TcfModelAnswers;
  /** TCF only: get_results tcf_access — which recordings exist but were withheld. */
  tcfAccess?: TcfAccess;
  /** CELPIP only: writing/speaking model answers at CLB 5/7/9 and the steps, by task position. */
  celpipModelAnswers?: CelpipModelAnswers;
  /** CELPIP only: listening/reading explanations by answer key (get_results celpip_explanations). */
  celpipExplanations?: TcfExplanations;
  /** CELPIP: this session, for a translate request (its option order sets the letters). */
  sessionId?: string;
  /** Listening, full result only (both exams): part / item position → its recording. */
  listeningAudio?: Record<string, string>;
  /** Listening / reading: the audio, transcript or reading text exists but this result is locked. */
  reviewLocked?: boolean;
  vsAvgT: (key: 'vsAvgPositive' | 'vsAvgNegative' | 'vsAvgEqual', val?: string) => string;
  /** Exam profile scale; defaults to CLB out of 12. */
  scale?: ScoreScale;
  /** False when this exam has no AI insight (TCF): no Insight sub-tab. */
  insightEnabled?: boolean;
  /** Still in the scoring queue: the score and feedback are on their way. */
  pending?: boolean;
  /**
   * A practice slice of TCF CO/CE items: its 100–699 score and band describe a
   * whole 39-item paper, so the header shows only right answers out of the items.
   */
  slice?: boolean;
}

/**
 * One skill's full story in a single tab: a compact score header, then the
 * answer review and that skill's AI insight as sibling sub-tabs (Part 1 · Part 2
 * · … · Insight) so the analysis is one click away, never buried below.
 */
export function SkillTab({
  skill,
  label,
  score,
  avg,
  result,
  mcqContent,
  insightState,
  insight,
  insightOrigin,
  onRetryInsight,
  yourAnswerLabel,
  taskLabel,
  speakingTasks,
  mediaLocked,
  modelAnswers,
  tcfExplanations,
  tcfModelAnswers,
  tcfAccess,
  celpipModelAnswers,
  celpipExplanations,
  sessionId,
  listeningAudio,
  reviewLocked = false,
  vsAvgT,
  scale = CLB_SCALE,
  insightEnabled = true,
  slice = false,
  pending = false,
}: SkillTabProps) {
  const { t } = useTranslation('exam');
  const meta = SECTION_META[skill];
  const Icon = meta.icon;
  const isMcq = skill === 'listening' || skill === 'reading';

  // MCQ accuracy (distinct from the CLB level) for the header chip.
  let correctCount = 0;
  let totalCount = 0;
  if (isMcq && mcqContent) {
    const userAnswers = (result.answers || {}) as Record<string, number>;
    mcqContent.parts.forEach((part, pi) => {
      part.questions.forEach((q, qi) => {
        totalCount++;
        if (userAnswers[`part_${pi}_q_${qi}`] === q.correct_index) correctCount++;
      });
    });
  }
  const accuracyPct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  // One header for every section — icon, name, vs-average, score and its bar —
  // so writing and speaking read like listening and reading (owner, 2026-10-16:
  // «فرق نباید بکنه بخش ها»). The task tabs carry only the per-task scores.
  const showScoreLine = true;
  // Against the learner's own earlier runs, as plain coloured text.
  const delta =
    scale.bandKind !== 'level' && score != null && avg != null
      ? Math.round((score - avg) * 10) / 10
      : null;
  const skillLine = showScoreLine ? undefined : (
    <>
      <span className="text-[13px] text-muted-foreground min-w-0">
        <span className="block truncate">
          {t('results.overallSkillScore', { skill: label })}{' '}
          <span className="font-bold text-foreground tabular-nums">
            {score != null ? scale.format(score) : '–'}
          </span>
          {scale.bandKind !== 'level' && <span className="tabular-nums"> / {scale.bandMax}</span>}
        </span>
      </span>
      {delta != null && (
        <span
          className={`text-[13px] font-semibold tabular-nums shrink-0 ${
            delta > 0 ? 'text-success' : delta < 0 ? 'text-error' : 'text-caption'
          }`}
        >
          {delta > 0
            ? vsAvgT('vsAvgPositive', String(delta))
            : delta < 0
              ? vsAvgT('vsAvgNegative', String(delta))
              : vsAvgT('vsAvgEqual')}
        </span>
      )}
    </>
  );

  // CELPIP: a question whose explanation sits in its own review card is not
  // explained a second time in the Insight pill (the insight's summary stays).
  const mcqExplanations = isMcq
    ? celpipExplanations?.[skill as 'listening' | 'reading']
    : undefined;
  const explainedInCard = mcqExplanations
    ? new Set(
        Object.entries(mcqExplanations)
          .filter(([, e]) => !('locked' in e && e.locked))
          .map(([key]) => key),
      )
    : undefined;

  // A finished insight that adds nothing to the review cards gets no tab at all
  // (owner, 2026-10-16: «اگه تحلیلی نیست پس کلا نباید اینجا نشونش بدیم»): it is
  // worth a tab only with a wrong answer that has no explanation in its own card,
  // a trap repeated at least twice, or techniques to practise. A strategy line
  // alone is not. While the insight is still on its way the tab stays.
  const mcqInsight = isMcq ? insight[skill as 'listening' | 'reading'] : undefined;
  const insightAddsNothing =
    isMcq &&
    insightState === 'ready' &&
    (!mcqInsight ||
      (!mcqInsight.question_analyses.some(
        (qa) => !explainedInCard?.has(`part_${qa.part_index ?? 0}_q_${qa.question_index}`),
      ) &&
        (mcqInsight.patterns?.top_traps?.[0]?.count ?? 0) < 2 &&
        (mcqInsight.patterns?.techniques_to_drill?.length ?? 0) === 0));

  // The AI insight for this skill — surfaced as a trailing "Insight" sub-tab.
  const insightPanel =
    !insightEnabled || insightAddsNothing ? undefined : (
      <SkillInsightPanel
        skill={skill}
        state={insightState}
        insight={insight}
        origin={insightOrigin}
        onRetry={onRetryInsight}
        explainedInCard={explainedInCard}
      />
    );

  return (
    <div className="flex flex-col gap-5">
      {/* The section's score line — the same in all four sections. */}
      {showScoreLine && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className={`w-4 h-4 shrink-0 ${meta.color}`} />
            <p className="text-[15px] font-bold text-foreground capitalize">{label}</p>
            <VsAvgBadge score={scale.bandKind === 'level' ? null : score} avg={avg} t={vsAvgT} />
            {insightEnabled && insightState === 'ready' && (
              <InsightOriginBadge origin={insightOrigin} />
            )}
            {isMcq && totalCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold tabular-nums px-1.5 py-[2px] rounded-full bg-muted text-muted-foreground">
                {correctCount}/{totalCount}
                <span className="text-caption">· {accuracyPct}%</span>
              </span>
            )}
            {!slice && (
              <div className="ms-auto flex items-baseline gap-1.5">
                {score == null && pending ? (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground self-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('examSectionAnalyzing')}
                  </span>
                ) : (
                  <span className="text-[24px] font-bold leading-none tabular-nums text-foreground">
                    {score != null ? scale.format(score) : '–'}
                  </span>
                )}
                <span className="text-[11px] text-caption tabular-nums">
                  {scale.bandKind === 'level' ? (
                    scale.bandLabel
                  ) : (
                    <bdi dir="ltr">
                      / {scale.bandMax} {scale.bandLabel}
                    </bdi>
                  )}
                </span>
                {scale.rawMax[skill] != null && result.raw_score != null && (
                  <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                    · {result.raw_score} / {scale.rawMax[skill]}
                  </span>
                )}
              </div>
            )}
          </div>
          {!slice && (
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 bg-primary ${scale.bandWidth(score)}`}
              />
            </div>
          )}
        </div>
      )}

      {/* Answer review + Insight, as sibling sub-tabs (Part/Task … · Insight) */}
      {isMcq ? (
        <McqResultTab
          result={result}
          examContent={mcqContent}
          yourAnswerLabel={yourAnswerLabel}
          insightNode={insightPanel}
          insightLabel={t('insightTab')}
          insightState={insightState}
          itemsMode={scale.itemsMode}
          contentLang={scale.contentLang}
          tcfExplanations={tcfExplanations?.[skill as 'listening' | 'reading']}
          // The results page reviews both exams as wrong / right tabs (CELPIP by question).
          reviewTabs
          celpipExplanations={mcqExplanations}
          sessionId={sessionId}
          listeningAudio={skill === 'listening' ? listeningAudio : undefined}
          reviewLocked={reviewLocked}
          // Listening: each recording and its transcript; reading: the text. Both exams.
          reviewLockedText={
            skill === 'reading'
              ? t('results.lockedReadingReview')
              : t('results.lockedListeningReview')
          }
        />
      ) : (
        <AiInsightTab
          result={result}
          sessionId={sessionId ?? ''}
          taskLabel={taskLabel}
          skillLine={skillLine}
          // Each task's corrections live in that task's card, not under a
          // separate Insight tab that stacked all eight tasks on one page.
          renderTaskInsight={
            insightEnabled
              ? (taskIndex) => (
                  <SkillInsightPanel
                    skill={skill}
                    state={insightState}
                    insight={insight}
                    origin={insightOrigin}
                    onRetry={onRetryInsight}
                    taskIndex={taskIndex}
                  />
                )
              : undefined
          }
          insightState={insightState}
          speakingTasks={skill === 'speaking' ? speakingTasks : undefined}
          // TCF has no pictures: its lock speaks of the recording alone, and only
          // where one exists (an older server: CELPIP's flag).
          mediaLocked={
            skill !== 'speaking'
              ? undefined
              : tcfAccess
                ? (tcfAccess.recordings_locked ?? mediaLocked)
                : mediaLocked
          }
          mediaLockedText={
            skill === 'speaking' && tcfAccess ? t('results.tcfRecordingLocked') : undefined
          }
          modelAnswers={skill === 'speaking' ? modelAnswers : undefined}
          tcfModelAnswers={tcfModelAnswers?.[skill as 'writing' | 'speaking']}
          celpipModelAnswers={celpipModelAnswers?.[skill as 'writing' | 'speaking']}
          bandLabel={scale.bandLabel}
          criterionMax={scale.criterionMax}
          taskIndexBase={scale.taskIndexBase}
          contentLang={scale.contentLang}
        />
      )}
    </div>
  );
}
