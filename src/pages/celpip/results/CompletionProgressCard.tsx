import { useState, useEffect } from 'react';
import { Loader2, Sparkles, RefreshCw, Check, Clock, RotateCcw, Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SECTION_META } from './shared';
import type { SectionResult } from '../types';
import type { CompletionSkill, SectionScoringState } from '../hooks/useExamCompletionPoll';

const SKILL_ORDER: CompletionSkill[] = ['listening', 'reading', 'writing', 'speaking'];

const PANEL = `rounded-[9px] border border-border bg-card shadow-sm`;

// Waiting on AI scoring (esp. speaking transcription) can take a couple of
// minutes — rotate short tips so the wait has something to read instead of a
// frozen checklist.
const TIP_ROTATE_MS = 5000;

interface CompletionProgressCardProps {
  sectionResults: SectionResult[];
  sectionLabels: Record<string, string>;
  sectionStates: Partial<Record<CompletionSkill, SectionScoringState>>;
  progress: { done: number; total: number };
  stalled: boolean;
  onRetry: () => void;
  onResume: () => void;
}

function RowIndicator({ state }: { state: SectionScoringState | undefined }) {
  const { t } = useTranslation('exam');
  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-success">
        <Check className="w-3.5 h-3.5" />
      </span>
    );
  }
  if (state === 'analyzing') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-accent">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t('examSectionAnalyzing')}
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-error">
        <span className="w-1.5 h-1.5 rounded-full bg-error" />
        {t('examSectionFailed')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-caption">
      <Clock className="w-3.5 h-3.5" />
      {t('examSectionQueued')}
    </span>
  );
}

export function CompletionProgressCard({
  sectionResults,
  sectionLabels,
  sectionStates,
  progress,
  stalled,
  onRetry,
  onResume,
}: CompletionProgressCardProps) {
  const { t } = useTranslation('exam');

  // Rotating tips. Hooks must run before any early return below, so keep them
  // at the top even though only the scoring-checklist branch renders the tip.
  const rawTips: unknown = t('scoringTips', { returnObjects: true });
  const tips = Array.isArray(rawTips) ? (rawTips as string[]) : [];
  const [tipIndex, setTipIndex] = useState(0);
  useEffect(() => {
    if (tips.length <= 1) return;
    const id = setInterval(() => setTipIndex((i) => (i + 1) % tips.length), TIP_ROTATE_MS);
    return () => clearInterval(id);
  }, [tips.length]);

  // A section still 'pending' means the user hasn't submitted it yet — this
  // is a genuinely different state from "submitted, waiting on AI scoring",
  // and needs its own message + a way back into the exam, not a scoring
  // checklist that would otherwise show a taken-but-unsubmitted section as
  // permanently "queued".
  const isMidExam = sectionResults.some((r) => r.status === 'pending');

  if (isMidExam) {
    return (
      <div className={`${PANEL} py-12 px-8 text-center max-w-md w-full mx-auto`}>
        <div className="w-[52px] h-[52px] rounded-[14px] bg-muted border border-border flex items-center justify-center mx-auto mb-4">
          <RotateCcw className="w-6 h-6 text-caption" />
        </div>
        <h2 className="text-[15px] font-bold text-foreground mb-2">{t('examResumeTitle')}</h2>
        <p className="text-[12.5px] text-muted-foreground mb-4 leading-relaxed">
          {t('examResumeMessage')}
        </p>
        <Button variant="accent" size="md" onClick={onResume}>
          {t('examResumeCta')}
        </Button>
      </div>
    );
  }

  if (stalled) {
    return (
      <div className={`${PANEL} py-12 px-8 text-center max-w-md w-full mx-auto`}>
        <div className="w-[52px] h-[52px] rounded-[14px] bg-error/[0.10] border border-error/30 flex items-center justify-center mx-auto mb-4">
          <RefreshCw className="w-6 h-6 text-error" />
        </div>
        <h2 className="text-[15px] font-bold text-foreground mb-2">{t('examScoringStalled')}</h2>
        <p className="text-[12.5px] text-muted-foreground mb-4 leading-relaxed">
          {t('examScoringStalledMessage')}
        </p>
        <Button variant="outline" size="md" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5" />
          {t('examScoringRetry')}
        </Button>
      </div>
    );
  }

  const takenSkills = SKILL_ORDER.filter((s) => sectionResults.some((r) => r.section_type === s));

  return (
    <div className={`${PANEL} py-10 px-6 sm:px-8 max-w-lg w-full mx-auto`}>
      <div className="text-center mb-6">
        <div className="w-[52px] h-[52px] rounded-[14px] bg-accent/[0.10] border border-accent/30 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-6 h-6 text-accent animate-pulse" />
        </div>
        <h2 className="text-[15px] font-bold text-foreground mb-1">{t('examScoringTitle')}</h2>
        <span className="inline-block text-[11.5px] tabular-nums font-semibold px-2 py-[3px] rounded-[6px] bg-accent/10 text-accent">
          {t('examScoringProgress', { done: progress.done, total: progress.total })}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {takenSkills.map((skill) => {
          const meta = SECTION_META[skill];
          const Icon = meta.icon;
          const state = sectionStates[skill];
          return (
            <div
              key={skill}
              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[9px] border ${meta.border} ${meta.bg}`}
            >
              <span
                className={`inline-flex items-center gap-2 text-[12.5px] font-semibold ${meta.color}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {sectionLabels[skill] ?? skill}
              </span>
              <RowIndicator state={state} />
            </div>
          );
        })}
      </div>

      {sectionStates.speaking === 'analyzing' && (
        <p className="text-[11.5px] text-caption text-center mt-3 leading-relaxed">
          {t('speakingScoringHint')}
        </p>
      )}

      {takenSkills.some((s) => sectionStates[s] === 'failed') && (
        <p className="text-[11.5px] text-caption text-center mt-4">
          {t('examSectionFailedRetryNote')}
        </p>
      )}

      {tips.length > 0 && (
        <div className="mt-6 flex items-start gap-2.5 rounded-[9px] border border-border bg-muted px-3.5 py-3">
          <Lightbulb className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p
            key={tipIndex}
            className="animate-in fade-in duration-700 text-[12px] leading-relaxed text-muted-foreground"
          >
            {tips[tipIndex]}
          </p>
        </div>
      )}
    </div>
  );
}
