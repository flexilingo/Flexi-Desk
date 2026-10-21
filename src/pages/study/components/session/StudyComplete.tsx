import { useTranslation } from 'react-i18next';
import {
  PartyPopper,
  TrendingUp,
  TrendingDown,
  Sparkles,
  CalendarClock,
  Trophy,
  Check,
  X,
  Zap,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SessionSummaryResponse } from '../../types';

interface Props {
  summary: SessionSummaryResponse | null;
  elapsedSeconds: number;
  onDone: () => void;
  onStudyMore: () => void;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** One tile of the SRS grid. */
function SrsTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <Icon className={cn('h-4 w-4 shrink-0', tone)} />
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="ms-auto font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function StudyComplete({ summary, elapsedSeconds, onDone, onStudyMore }: Props) {
  const { t } = useTranslation('study');

  const total = summary?.session.activities_total ?? 0;
  const correct = summary?.session.activities_correct ?? 0;
  const incorrect = Math.max(0, total - correct);
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const srs = summary?.srs_stats;
  const xp = summary?.xp_earned ?? 0;

  // Accuracy ring tone follows performance.
  const ringTone = accuracy >= 80 ? 'text-success' : accuracy >= 50 ? 'text-warning' : 'text-error';
  const barTone = accuracy >= 80 ? 'bg-success' : accuracy >= 50 ? 'bg-warning' : 'bg-error';

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
        <PartyPopper className="h-8 w-8" />
      </div>
      <h2 className="text-2xl font-bold text-foreground">{t('complete.title')}</h2>

      {/* Accuracy summary */}
      <div className="w-full rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className={cn('text-[40px] font-black leading-none tabular-nums', ringTone)}>
              {accuracy}%
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{t('complete.accuracy')}</div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-success">
              <Check className="h-4 w-4" />
              <span className="font-semibold tabular-nums">{correct}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-error">
              <X className="h-4 w-4" />
              <span className="font-semibold tabular-nums">{incorrect}</span>
            </span>
            <span className="text-muted-foreground">
              {t('complete.time')}{' '}
              <span className="font-semibold text-foreground">{fmt(elapsedSeconds)}</span>
            </span>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full transition-all duration-500', barTone)}
            style={{ width: `${accuracy}%` }}
          />
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          {t('complete.reviewed')}:{' '}
          <span className="font-semibold text-foreground tabular-nums">{total}</span>
        </div>
      </div>

      {/* XP card */}
      {xp > 0 && (
        <div className="flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <Zap className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{t('complete.xpEarned')}</div>
            <div className="text-[11px] text-muted-foreground">{t('complete.xpHint')}</div>
          </div>
          <div className="text-xl font-black text-primary tabular-nums">+{xp}</div>
        </div>
      )}

      {/* SRS tiles */}
      {srs && (
        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
          <SrsTile
            icon={TrendingUp}
            label={t('complete.promotions')}
            value={srs.promotions}
            tone="text-success"
          />
          <SrsTile
            icon={TrendingDown}
            label={t('complete.demotions')}
            value={srs.demotions}
            tone="text-warning"
          />
          <SrsTile
            icon={Trophy}
            label={t('complete.newlyMastered')}
            value={srs.newly_mastered}
            tone="text-primary"
          />
          <SrsTile
            icon={GraduationCap}
            label={t('complete.newLearned')}
            value={srs.new_learned}
            tone="text-primary"
          />
          <SrsTile
            icon={Sparkles}
            label={t('complete.duesReviewed')}
            value={srs.dues_reviewed}
            tone="text-success"
          />
          <SrsTile
            icon={CalendarClock}
            label={t('complete.tomorrow')}
            value={srs.tomorrow_forecast}
            tone="text-muted-foreground"
          />
        </div>
      )}

      {/* Per-deck breakdown */}
      {summary && summary.per_deck_counts.length > 0 && (
        <div className="w-full rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('complete.byDeck')}
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {summary.per_deck_counts.map((d) => (
              <li key={d.deck_id} className="flex justify-between">
                <span className="text-foreground">{d.deck_title}</span>
                <span className="tabular-nums text-muted-foreground">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onStudyMore}>
          {t('complete.studyMore')}
        </Button>
        <Button onClick={onDone}>{t('complete.done')}</Button>
      </div>
    </div>
  );
}
