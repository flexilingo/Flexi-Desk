import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type {
  ExamInsight,
  InsightSkill,
  InsightSkillState,
  InsightOrigin,
  SectionResult,
  ListeningContent,
  ReadingContent,
} from '../types';
import { CLB_WIDTH, clbTextColor, clbBarColor, SECTION_META } from './shared';
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
  insightOrigin: InsightOrigin;
  onRetryInsight: () => void;
  yourAnswerLabel: string;
  taskLabel: string;
  vsAvgT: (key: 'vsAvgPositive' | 'vsAvgNegative' | 'vsAvgEqual', val?: string) => string;
}

/**
 * One skill's full story in a single tab: compact score header, the answer
 * review, then that skill's AI insight (with its own loading/error states).
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
  vsAvgT,
}: SkillTabProps) {
  const { t } = useTranslation('celpip');
  const meta = SECTION_META[skill];
  const Icon = meta.icon;
  const isMcq = skill === 'listening' || skill === 'reading';

  return (
    <div className="flex flex-col gap-5">
      {/* Compact score header */}
      <div
        className={`rounded-[14px] border ${meta.border} ${meta.bg} p-4 flex items-center gap-4`}
      >
        <span className="w-10 h-10 rounded-[12px] bg-card/70 flex items-center justify-center shrink-0">
          <Icon className={`w-5 h-5 ${meta.color}`} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-[13px] font-bold capitalize ${meta.color}`}>{label}</p>
            <VsAvgBadge score={score} avg={avg} t={vsAvgT} />
          </div>
          <div className="h-1.5 bg-card/70 rounded-full overflow-hidden mt-2 max-w-[280px]">
            <div
              className={`h-full rounded-full ${clbBarColor(score)} ${
                score != null ? (CLB_WIDTH[score] ?? 'w-0') : 'w-0'
              }`}
            />
          </div>
        </div>
        <div className="text-end shrink-0">
          <span
            className={`text-[26px] font-extrabold leading-none tabular-nums ${clbTextColor(score)}`}
          >
            {score ?? '–'}
          </span>
          <span className="block text-[10px] text-muted-foreground tabular-nums uppercase tracking-wider mt-0.5">
            / 12 CLB
          </span>
        </div>
      </div>

      {/* Answer review — distinct from the staged insight below; this reads the
          grader's per-task `ai_feedback` captured at scoring time. */}
      {isMcq ? (
        <McqResultTab result={result} examContent={mcqContent} yourAnswerLabel={yourAnswerLabel} />
      ) : (
        <AiInsightTab result={result} taskLabel={taskLabel} />
      )}

      {/* Per-skill AI insight */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] font-bold text-accent uppercase tracking-[.12em] inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {t('aiInsight')}
          </p>
          {/* Quiet provenance — where THIS analysis was generated. */}
          <InsightOriginBadge origin={insightOrigin} />
        </div>
        <SkillInsightPanel
          skill={skill}
          state={insightState}
          insight={insight}
          origin={insightOrigin}
          onRetry={onRetryInsight}
        />
      </div>
    </div>
  );
}
