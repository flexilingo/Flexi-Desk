import { useTranslation } from 'react-i18next';
import { Sparkles, RefreshCw, Lock, Info, Cloud, Cpu, KeyRound } from 'lucide-react';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { AiStoppedNotice, AiWorkingStatus } from '@/components/ai/AiWait';
import type { AiStopKind } from '@/lib/aiSource';
import { useAiSource } from '@/stores/aiSourceStore';
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
import { McqInsightSection, TaskCorrections } from './InsightSections';

/**
 * Quiet provenance chip: says where an analysis really came from - the AI on this
 * device, the user's own key, or FlexiLingo's cloud (only when switched on in
 * Settings). Understated on purpose; it is not a CTA.
 */
export function InsightOriginBadge({ origin }: { origin: InsightOrigin }) {
  const { t } = useTranslation('ai');
  const key = origin === 'own_key' ? 'ownKey' : origin;
  const Icon = origin === 'cloud' ? Cloud : origin === 'own_key' ? KeyRound : Cpu;
  return (
    <span
      title={t(`originHint.${key}`)}
      className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border"
    >
      <Icon className="w-2.5 h-2.5" />
      {t(`origin.${key}`)}
    </span>
  );
}

/**
 * Shown when an on-device or own-key insight fails. If the cause is that the user's
 * AI is not set up, it is the shared setup card; otherwise a plain retry. Never a
 * cloud fallback.
 */
export function LocalModelGate({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('celpip');
  const { own } = useAiSource();
  if (own.kind === 'unconfigured') return <AiSetupCard onReady={onRetry} />;
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

/** A run on the user's own AI: how long it has taken, Cancel, and why it stopped. */
export interface InsightWait {
  /** Start of the request running for THIS skill; null when none is. */
  startedAt: number | null;
  stopKind: AiStopKind | null;
  onCancel: () => void;
}

interface SkillInsightPanelProps {
  skill: Exclude<InsightSkill, 'summary'>;
  state: InsightSkillState;
  insight: Partial<ExamInsight>;
  onRetry: () => void;
  /** Where this analysis was generated — drives the error path (own AI ⇒ setup gate). */
  origin: InsightOrigin;
  /** Writing/speaking: the task whose corrections to show (inside that task's card). */
  taskIndex?: number;
  /**
   * Listening/reading: answer keys `part_<p>_q_<q>` whose explanation is already in the
   * question's own review card, left out here so nothing is explained twice.
   */
  explainedInCard?: Set<string>;
  wait?: InsightWait;
}

/** The AI-insight block inside a skill tab — one state at a time. */
export function SkillInsightPanel({
  skill,
  state,
  insight,
  onRetry,
  origin,
  taskIndex,
  explainedInCard,
  wait,
}: SkillInsightPanelProps) {
  const { t } = useTranslation('celpip');

  if (state === 'not_taken') return null;

  if (state === 'ready') {
    if (skill === 'listening' || skill === 'reading') {
      const data = insight[skill] as InsightMcqSectionData | undefined;
      return data ? (
        <McqInsightSection data={data} sectionType={skill} explainedInCard={explainedInCard} />
      ) : null;
    }
    const tasks = ((skill === 'writing' ? insight.writing : insight.speaking) ?? []) as Array<
      InsightWritingTask | InsightSpeakingTask
    >;
    const shown =
      taskIndex === undefined ? tasks : tasks.filter((task) => task.task_index === taskIndex);
    if (shown.length === 0) return null;
    return (
      <div className="flex flex-col gap-5">
        {shown.map((task) => (
          <TaskCorrections key={task.task_index} task={task} />
        ))}
      </div>
    );
  }

  if (state === 'pending' && origin !== 'cloud' && wait?.stopKind) {
    // Waiting behind a request that was stopped: Try again starts the queue again.
    return <AiStoppedNotice kind={wait.stopKind} onRetry={onRetry} />;
  }

  if (state === 'generating' || state === 'pending') {
    return (
      <div className="bg-muted border border-border rounded-[14px] p-5 flex flex-col gap-3 shadow-sm">
        <p className="text-[12.5px] font-semibold text-muted-foreground inline-flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" />
          {t('insightAnalyzingSection')}
        </p>
        {origin !== 'cloud' && wait && (
          <AiWorkingStatus startedAt={wait.startedAt} onCancel={wait.onCancel} />
        )}
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
    // Too slow, or cancelled: the plain reason and Try again, never a bare "failed".
    if (origin !== 'cloud' && wait?.stopKind) {
      return <AiStoppedNotice kind={wait.stopKind} onRetry={onRetry} />;
    }
    // A local failure is almost always the model not being runnable, which the
    // user can fix — send them to the actionable gate rather than a bare retry.
    if (origin !== 'cloud') return <LocalModelGate onRetry={onRetry} />;
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
