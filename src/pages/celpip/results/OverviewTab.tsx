import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Sparkles, RefreshCw, Lock, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExamInsight, InsightSkillState, InsightOrigin } from '../types';
import { CLB_SCALE, clbTextColor, clbBarColor, SECTION_META, type ScoreScale } from './shared';
import { HeroScoreCard, VsAvgBadge } from './HeroScoreCard';
import { SummaryCard, ImprovementPlanCard } from './InsightSections';
import { InsightOriginBadge } from './SkillInsightPanel';

interface OverviewTabProps {
  mScore: number | null;
  mScoreAvg: number | null;
  totalTimeSec: number | null;
  levelLabel: string | null;
  takenSections: string[];
  sectionScores: Record<string, number | null>;
  sectionAvgs: Record<string, number | null>;
  sectionLabels: Record<string, string>;
  onOpenSkill: (skill: string) => void;
  insight: Partial<ExamInsight>;
  insightOrigin: InsightOrigin;
  summaryState: InsightSkillState;
  progress: { done: number; total: number };
  limitReached: boolean;
  /** Skills whose generation failed — surfaced with a retry instead of the skeleton */
  erroredSkills?: string[];
  onRetryFailed?: () => void;
  onRetrySummary: () => void;
  vsAvgT: (key: 'vsAvgPositive' | 'vsAvgNegative' | 'vsAvgEqual', val?: string) => string;
  /** Exam profile scale; defaults to CLB out of 12. */
  scale?: ScoreScale;
  /** Raw score per section, shown beside the band (TCF /699 and /20). */
  rawScores?: Record<string, number | null>;
  /** A practice slice of CO/CE items: right answers out of the items sat, in place of a band. */
  correctCounts?: Partial<Record<string, { correct: number; total: number }>>;
  correctLabel?: string;
  /** False for exams with no AI insight (TCF): the summary area is left out. */
  insightEnabled?: boolean;
  /** One quiet note under the scores (the TCF estimate note). */
  note?: string;
  /** Caption over the big number. Defaults to the CELPIP one. */
  overallLabel?: string;
  /** Sections still in the scoring queue. */
  pendingSkills?: string[];
  /** Québec points card, and the "your next step" card (TCF). */
  quebecPoints?: ReactNode;
  nextSteps?: ReactNode;
  /** Opens "how is this scored?"; the (i) on the ring shows only when set. */
  onScoringInfo?: () => void;
  scoringInfoLabel?: string;
}

/**
 * Default results tab: M-score hero + per-skill score cards (each opens its
 * skill tab) + the AI summary and improvement plan once the staged insight
 * finishes. While skills are still generating, shows a live progress line.
 *
 * Unlike the web, there is no Pro gate: a free user's summary is produced by the
 * on-device model, so every generation state below applies to all users.
 */
export function OverviewTab({
  mScore,
  mScoreAvg,
  totalTimeSec,
  levelLabel,
  takenSections,
  sectionScores,
  sectionAvgs,
  sectionLabels,
  onOpenSkill,
  insight,
  insightOrigin,
  summaryState,
  progress,
  limitReached,
  erroredSkills,
  onRetryFailed,
  onRetrySummary,
  vsAvgT,
  scale = CLB_SCALE,
  rawScores,
  correctCounts,
  correctLabel,
  insightEnabled = true,
  note,
  overallLabel,
  pendingSkills = [],
  quebecPoints,
  nextSteps,
  onScoringInfo,
  scoringInfoLabel,
}: OverviewTabProps) {
  const { t } = useTranslation('celpip');
  // A practice slice of items only (no band anywhere): the ring shows the count.
  const countEntries = Object.entries(correctCounts ?? {}).filter(([, c]) => c && c.total > 0);
  const overallCount = countEntries.length
    ? {
        correct: countEntries.reduce((n, [, c]) => n + (c?.correct ?? 0), 0),
        total: countEntries.reduce((n, [, c]) => n + (c?.total ?? 0), 0),
        label: correctLabel ?? '',
      }
    : undefined;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Score overview row */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
        <HeroScoreCard
          score={mScore}
          avg={mScoreAvg}
          totalTimeSec={totalTimeSec}
          mScoreLabel={overallLabel ?? t('mScoreLabel')}
          aiAnalyzedLabel={insightEnabled ? t('aiAnalyzed') : undefined}
          scale={scale}
          count={overallCount}
          pendingLabel={pendingSkills.length > 0 ? t('scoringInProgress') : undefined}
          onInfo={onScoringInfo}
          infoLabel={scoringInfoLabel}
          levelLabel={levelLabel}
          vsAvgPositive={(d) => t('vsAvgPositive', { delta: d })}
          vsAvgNegative={(d) => t('vsAvgNegative', { delta: d })}
          vsAvgEqual={t('vsAvgEqual')}
        />

        {/* Section score cards — each opens its skill tab */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['listening', 'reading', 'writing', 'speaking'] as const)
            .filter((k) => takenSections.includes(k))
            .map((key) => {
              const meta = SECTION_META[key];
              const score = sectionScores[key];
              const Icon = meta.icon;
              const tone = scale.toneScore(score);
              const raw = rawScores?.[key] ?? null;
              const rawMax = scale.rawMax[key] ?? null;
              const count = correctCounts?.[key];
              const isPending = pendingSkills.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => onOpenSkill(key)}
                  className="group rounded-[14px] border-2 border-border bg-card hover:border-muted-foreground/30 p-4 text-start transition-all relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <Icon className={`w-5 h-5 ${meta.color}`} />
                    <VsAvgBadge
                      score={scale.bandKind === 'level' ? null : score}
                      avg={sectionAvgs[key]}
                      t={vsAvgT}
                    />
                  </div>
                  <div className="mt-2 mb-1">
                    {isPending && score == null ? (
                      <Loader2 className="w-5 h-5 animate-spin text-accent" />
                    ) : count && score == null ? (
                      <div className="text-[24px] font-extrabold leading-none tabular-nums text-foreground">
                        <bdi dir="ltr">
                          {count.correct}/{count.total}
                        </bdi>
                      </div>
                    ) : (
                      <div
                        className={`text-[24px] font-extrabold leading-none tabular-nums ${clbTextColor(tone)}`}
                      >
                        {score != null ? scale.format(score) : '–'}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground tabular-nums uppercase tracking-wider mt-0.5">
                      {count && score == null ? (
                        correctLabel
                      ) : scale.bandKind === 'level' ? (
                        scale.bandLabel
                      ) : (
                        <bdi dir="ltr">
                          / {scale.bandMax} {scale.bandLabel}
                        </bdi>
                      )}
                    </div>
                    {rawMax != null && raw != null && (
                      <div className="text-[10.5px] text-muted-foreground tabular-nums mt-0.5">
                        <bdi dir="ltr">
                          {raw} / {rawMax}
                        </bdi>
                      </div>
                    )}
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                    <div
                      className={`h-full rounded-full ${clbBarColor(tone)} ${scale.bandWidth(score)}`}
                    />
                  </div>
                  <p
                    className={`text-[12px] font-bold mt-2 capitalize inline-flex items-center gap-1 ${meta.color}`}
                  >
                    {sectionLabels[key]}
                    <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity rtl:rotate-180" />
                  </p>
                </button>
              );
            })}
        </div>
      </div>

      {note && <p className="text-[12px] leading-relaxed text-muted-foreground">{note}</p>}

      {quebecPoints}
      {nextSteps}

      {/* AI summary area — none for exams without insight (TCF) */}
      {!insightEnabled ? null : summaryState === 'ready' && insight.summary ? (
        <>
          {/* Quiet provenance sits at the head of the finished insight. */}
          <div className="flex items-center justify-end">
            <InsightOriginBadge origin={insightOrigin} />
          </div>
          <SummaryCard summary={insight.summary} />
          <ImprovementPlanCard plan={insight.improvement_plan ?? []} />
        </>
      ) : summaryState === 'error' ? (
        <div className="bg-error/[0.06] border border-error/30 rounded-[14px] p-5 flex flex-col gap-3">
          <p className="text-[13px] text-error font-medium">{t('insightSummaryFailed')}</p>
          <div>
            <Button variant="outline" size="md" onClick={onRetrySummary}>
              <RefreshCw className="w-3.5 h-3.5" />
              {t('insightRetry')}
            </Button>
          </div>
        </div>
      ) : limitReached ? (
        <div className="bg-warning/[0.06] border border-warning/30 rounded-[14px] p-5 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {t('insightLimitReached')}
          </p>
        </div>
      ) : erroredSkills && erroredSkills.length > 0 ? (
        <div className="bg-error/[0.06] border border-error/30 rounded-[14px] p-5 flex flex-col gap-3">
          <p className="text-[13px] text-error font-medium">{t('insightSkillsFailed')}</p>
          <div>
            <Button variant="outline" size="md" onClick={onRetryFailed}>
              <RefreshCw className="w-3.5 h-3.5" />
              {t('insightRetry')}
            </Button>
          </div>
        </div>
      ) : summaryState === 'unavailable' || summaryState === 'not_taken' ? null : (
        <div className="bg-muted border border-border rounded-[14px] p-5 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[12.5px] font-semibold text-muted-foreground inline-flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" />
              {t('insightAnalyzingSkills')}
            </p>
            <div className="flex items-center gap-2">
              <InsightOriginBadge origin={insightOrigin} />
              <span className="text-[11.5px] tabular-nums font-semibold px-2 py-[3px] rounded-[6px] bg-accent/10 text-accent">
                {t('insightProgress', { done: progress.done, total: progress.total })}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2.5" aria-hidden="true">
            <div className="h-3.5 rounded-full bg-border animate-pulse w-2/3" />
            <div className="h-3.5 rounded-full bg-border animate-pulse w-4/5" />
          </div>
        </div>
      )}
    </div>
  );
}
