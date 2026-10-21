import { useTranslation } from 'react-i18next';
import { Sparkles, RefreshCw, Lock, Info, Cloud, Cpu, ServerCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  ExamInsight,
  InsightSkill,
  InsightSkillState,
  InsightMcqSection as InsightMcqSectionData,
  InsightWritingTask,
  InsightSpeakingTask,
  InsightOrigin,
} from '../types';
import {
  McqInsightSection,
  WritingInsightSection,
  SpeakingInsightSection,
} from './InsightSections';

/**
 * Quiet provenance chip. On desk, insight is NEVER Pro-gated — a free user gets
 * it from the on-device model — so instead of an upsell we simply state where a
 * given analysis came from. It is understated on purpose; it is not a CTA.
 *
 * `FlexiLingo` is a brand name (not translated); "On this device" has no i18n
 * key and the locale files are out of scope for this port, so it is a literal.
 */
export function InsightOriginBadge({ origin }: { origin: InsightOrigin }) {
  const isCloud = origin === 'cloud';
  const Icon = isCloud ? Cloud : Cpu;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
      <Icon className="w-2.5 h-2.5" />
      {isCloud ? 'FlexiLingo' : 'On this device'}
    </span>
  );
}

/**
 * Repurposed from front's `InsightProGate`. The web version was an upsell shown
 * to free users; desk has no paywall on insight, so this instead surfaces the
 * one thing a user must act on: the on-device model isn't runnable. It points at
 * Settings and offers a retry once they've started it.
 */
export function LocalModelGate({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('celpip');
  return (
    <div className="bg-warning/[0.08] border border-warning/30 rounded-[14px] p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-[10px] bg-warning/15 flex items-center justify-center shrink-0">
          <ServerCog className="w-4 h-4 text-warning" />
        </span>
        <p className="text-[13px] text-foreground leading-relaxed flex-1 self-center">
          {t('errors.OLLAMA_NOT_RUNNING')}
        </p>
      </div>
      <div>
        <Button variant="outline" size="md" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5" />
          {t('insightRetry')}
        </Button>
      </div>
    </div>
  );
}

interface SkillInsightPanelProps {
  skill: Exclude<InsightSkill, 'summary'>;
  state: InsightSkillState;
  insight: Partial<ExamInsight>;
  onRetry: () => void;
  /** Where this analysis was generated — drives the error path (local ⇒ gate). */
  origin: InsightOrigin;
}

/** The AI-insight block inside a skill tab — one state at a time. */
export function SkillInsightPanel({
  skill,
  state,
  insight,
  onRetry,
  origin,
}: SkillInsightPanelProps) {
  const { t } = useTranslation('celpip');

  if (state === 'not_taken') return null;

  if (state === 'ready') {
    if (skill === 'listening' || skill === 'reading') {
      const data = insight[skill] as InsightMcqSectionData | undefined;
      return data ? <McqInsightSection data={data} sectionType={skill} /> : null;
    }
    if (skill === 'writing') {
      const tasks = (insight.writing ?? []) as InsightWritingTask[];
      return (
        <div className="flex flex-col gap-5">
          {tasks.map((task) => (
            <WritingInsightSection key={task.task_index} task={task} />
          ))}
        </div>
      );
    }
    const tasks = (insight.speaking ?? []) as InsightSpeakingTask[];
    return (
      <div className="flex flex-col gap-5">
        {tasks.map((task) => (
          <SpeakingInsightSection key={task.task_index} task={task} />
        ))}
      </div>
    );
  }

  if (state === 'generating' || state === 'pending') {
    return (
      <div className="bg-muted border border-border rounded-[14px] p-5 flex flex-col gap-3 shadow-sm">
        <p className="text-[12.5px] font-semibold text-muted-foreground inline-flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" />
          {t('insightAnalyzingSection')}
        </p>
        <div className="flex flex-col gap-2.5" aria-hidden="true">
          <div className="h-3.5 rounded-full bg-border animate-pulse w-3/4" />
          <div className="h-3.5 rounded-full bg-border animate-pulse w-full" />
          <div className="h-3.5 rounded-full bg-border animate-pulse w-5/6" />
          <div className="h-3.5 rounded-full bg-border animate-pulse w-2/3" />
        </div>
      </div>
    );
  }

  if (state === 'error') {
    // A local failure is almost always the model not being runnable, which the
    // user can fix — send them to the actionable gate rather than a bare retry.
    if (origin === 'local') return <LocalModelGate onRetry={onRetry} />;
    return (
      <div className="bg-error/[0.06] border border-error/30 rounded-[14px] p-5 flex flex-col gap-3">
        <p className="text-[13px] text-error font-medium">{t('insightFailed')}</p>
        <div>
          <Button variant="outline" size="md" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5" />
            {t('insightRetry')}
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'limit_reached') {
    // Only the cloud enforces a quota; a Pro user who exhausts it lands here.
    return (
      <div className="bg-warning/[0.06] border border-warning/30 rounded-[14px] p-5 flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          {t('insightLimitReached')}
        </p>
      </div>
    );
  }

  // unavailable
  return (
    <div className="bg-muted border border-border rounded-[14px] p-5 flex items-start gap-2.5">
      <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <p className="text-[13px] text-muted-foreground leading-relaxed">{t('insightUnavailable')}</p>
    </div>
  );
}
