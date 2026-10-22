import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Lightbulb, Sparkles } from 'lucide-react';

const TIP_ROTATE_MS = 5000;
const TICK_MS = 1000;
// Usual time from submit to score. Only paces the bar — the panel goes away the
// moment the real score lands, early or late.
const TYPICAL_SEC = { speaking: 150, writing: 60 } as const;
// The bar never reaches the end on its own: only the real score finishes it.
const BAR_CEILING = 0.92;
const SLOW_AFTER_SEC = 5 * 60;

// Width steps for the bar (no inline styles).
const BAR_WIDTH = [
  'w-[4%]',
  'w-[10%]',
  'w-[16%]',
  'w-[22%]',
  'w-[28%]',
  'w-[34%]',
  'w-[40%]',
  'w-[46%]',
  'w-[52%]',
  'w-[58%]',
  'w-[64%]',
  'w-[70%]',
  'w-[76%]',
  'w-[82%]',
  'w-[88%]',
  'w-[92%]',
];

// When this page first saw each section scoring — kept across tab switches so
// coming back to the tab does not restart the bar.
const startedAt = new Map<string, number>();

interface ScoringProgressPanelProps {
  skill: 'speaking' | 'writing';
  /** queued = waiting for a scorer; analyzing = being scored right now. */
  state?: 'queued' | 'analyzing' | 'done' | 'failed';
  sessionId: string;
  /** How many answers were handed in — shown on the first, finished step. */
  answerCount: number;
}

/**
 * What a speaking or writing tab shows while its score is on the way. A lone
 * spinner for two or three minutes read as a frozen page, so this one keeps
 * moving: the steps tick through, the bar fills, the tips change.
 */
export function ScoringProgressPanel({
  skill,
  state,
  answerCount,
  sessionId,
}: ScoringProgressPanelProps) {
  const { t } = useTranslation('exam');
  const key = `${sessionId}:${skill}`;
  const [start] = useState(() => {
    if (!startedAt.has(key)) startedAt.set(key, Date.now());
    return startedAt.get(key)!;
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const rawTips: unknown = t('scoringTips', { returnObjects: true });
  const tips = Array.isArray(rawTips) ? (rawTips as string[]) : [];
  const [tipIndex, setTipIndex] = useState(0);
  useEffect(() => {
    if (tips.length <= 1) return;
    const id = setInterval(() => setTipIndex((i) => (i + 1) % tips.length), TIP_ROTATE_MS);
    return () => clearInterval(id);
  }, [tips.length]);

  const elapsedSec = (now - start) / 1000;
  // Eases toward the ceiling: quick at first, then slower, never "done".
  const progress = Math.min(BAR_CEILING, 1 - Math.exp(-elapsedSec / (TYPICAL_SEC[skill] / 2)));
  const slow = elapsedSec > SLOW_AFTER_SEC;
  const queued = state === 'queued';

  const steps =
    skill === 'speaking'
      ? [
          t('scoringSteps.received', { count: answerCount }),
          t('scoringSteps.transcribing'),
          t('scoringSteps.grading'),
          t('scoringSteps.feedback'),
        ]
      : [
          t('scoringSteps.receivedWriting', { count: answerCount }),
          t('scoringSteps.grading'),
          t('scoringSteps.feedback'),
        ];
  // The first step is real (the answers are in); the rest follow the bar.
  const active = queued
    ? 1
    : Math.min(steps.length - 1, 1 + Math.floor((progress / BAR_CEILING) * (steps.length - 1)));

  const barIndex = Math.min(
    BAR_WIDTH.length - 1,
    Math.floor((progress / BAR_CEILING) * (BAR_WIDTH.length - 1)),
  );

  return (
    <div className={`rounded-[9px] border border-border bg-card shadow-sm px-5 py-6 sm:px-7`}>
      <div className="flex items-center gap-3 mb-5">
        <span className="w-10 h-10 rounded-[10px] bg-primary/[0.10] flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary animate-pulse" />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-foreground leading-tight">
            {skill === 'speaking'
              ? t('scoringPanel.titleSpeaking')
              : t('scoringPanel.titleWriting')}
          </p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {slow
              ? t('scoringPanel.slow')
              : queued
                ? t('scoringPanel.queued')
                : skill === 'speaking'
                  ? t('scoringPanel.etaSpeaking')
                  : t('scoringPanel.etaWriting')}
          </p>
        </div>
      </div>

      <ol className="flex flex-col gap-2.5 mb-5">
        {steps.map((label, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li key={label} className="flex items-center gap-2.5">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  done
                    ? 'bg-primary text-white'
                    : current
                      ? 'bg-primary/[0.12] text-primary'
                      : 'border border-border bg-card'
                }`}
              >
                {done ? (
                  <Check className="w-3 h-3" />
                ) : current ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : null}
              </span>
              <span
                className={`text-[13px] ${
                  done
                    ? 'text-muted-foreground'
                    : current
                      ? 'text-foreground font-semibold'
                      : 'text-caption'
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-5" aria-hidden="true">
        <div
          className={`h-full rounded-full bg-primary transition-all duration-1000 ${BAR_WIDTH[barIndex]}`}
        />
      </div>

      {tips.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-[9px] bg-muted px-3.5 py-3">
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
