import { useTranslation } from 'react-i18next';
import { GraduationCap, Trophy, Target, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Dynamic widths must be Tailwind classes (desk forbids inline styles), so a
// percentage is bucketed to the nearest 10 and looked up here.
const BAR_WIDTH: Record<number, string> = {
  0: 'w-0',
  10: 'w-[10%]',
  20: 'w-[20%]',
  30: 'w-[30%]',
  40: 'w-[40%]',
  50: 'w-[50%]',
  60: 'w-[60%]',
  70: 'w-[70%]',
  80: 'w-[80%]',
  90: 'w-[90%]',
  100: 'w-full',
};

const barWidth = (pct: number): string =>
  BAR_WIDTH[Math.round(Math.min(100, Math.max(0, pct)) / 10) * 10];

interface StatCardsProps {
  /** Ranked-session count, best M-score, average M-score, and last-exam label. */
  total: number;
  best: number | null;
  avg: number | null;
  lastLabel: string | null;
}

export function StatCards({ total, best, avg, lastLabel }: StatCardsProps) {
  const { t } = useTranslation('celpip');
  const never = t('statsNever');

  return (
    <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      <StatCard
        icon={GraduationCap}
        tone="primary"
        title={t('statsTotalExams')}
        value={total}
        subText={t('statsSubtitleTotal')}
        percent={Math.min(total * 10, 100)}
      />
      <StatCard
        icon={Trophy}
        tone="success"
        title={t('statsBestScore')}
        value={best ?? never}
        subText={t('statsSubtitleBest')}
        percent={best != null ? (best / 12) * 100 : 0}
      />
      <StatCard
        icon={Target}
        tone="accent"
        title={t('statsAvgScore')}
        value={avg ?? never}
        subText={t('statsSubtitleAvg')}
        percent={avg != null ? (avg / 12) * 100 : 0}
      />
      <StatCard
        icon={Clock}
        tone="warning"
        title={t('statsLastExam')}
        value={lastLabel ?? never}
        subText={t('statsSubtitleLast')}
        percent={lastLabel ? 100 : 0}
      />
    </div>
  );
}

type Tone = 'primary' | 'success' | 'accent' | 'warning';

// Literal class strings (never string-concatenated) so the Tailwind scanner keeps them.
const TONE: Record<Tone, { stripe: string; tile: string; icon: string; bar: string }> = {
  primary: { stripe: 'bg-primary', tile: 'bg-primary/10', icon: 'text-primary', bar: 'bg-primary' },
  success: { stripe: 'bg-success', tile: 'bg-success/15', icon: 'text-success', bar: 'bg-success' },
  accent: { stripe: 'bg-accent', tile: 'bg-accent/15', icon: 'text-accent', bar: 'bg-accent' },
  warning: { stripe: 'bg-warning', tile: 'bg-warning/15', icon: 'text-warning', bar: 'bg-warning' },
};

function StatCard({
  icon: Icon,
  tone,
  title,
  value,
  subText,
  percent,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  value: string | number;
  subText: string;
  percent: number;
}) {
  const c = TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-[3px] ${c.stripe}`} />
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${c.tile}`}
        >
          <Icon className={`h-4 w-4 ${c.icon}`} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="text-[20px] font-extrabold leading-tight tabular-nums text-foreground">
            {value}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{subText}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${c.bar} ${barWidth(percent)}`} />
      </div>
    </div>
  );
}
