import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  Check,
  GraduationCap,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SessionSummaryResponse } from '../../types';
import { factsOf, formatClock, headlineOf, pct } from '../../lib/studyReport';
import {
  DeckPanel,
  ForecastPanel,
  LevelPanel,
  RecallPanel,
  ReportPanel,
  ReportSkeleton,
  SessionHero,
  StrugglePanel,
} from './report';

interface Props {
  summary: SessionSummaryResponse | null;
  /** The end-session call has settled (succeeded or failed). Until then the report is a skeleton, never zeros. */
  resolved: boolean;
  /** The session clock and tally — the last resort when the summary never came. */
  elapsedSeconds: number;
  tally: { correct: number; incorrect: number };
  onDone: () => void;
  /** Re-review the same scope, even cards no longer due. */
  onReviewAgain: () => void;
  /** Starts the weak-words scope. */
  onDrillWeak: () => void;
  starting: boolean;
  error?: string | null;
  /** The session was a shadowing run: nothing was graded, so the report is words heard and time played, not a percentage. */
  shadowing?: boolean;
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

/**
 * The end-of-session report. Two shapes, chosen by what the engine returned:
 *
 *  - `session_insights` present: the report — recall first-try vs by the end, the words that
 *    fought back (with "drill weak"), the days ahead, the level spread, the decks involved.
 *  - absent: the plain accuracy card. Insights are best-effort in the engine, so this fallback
 *    is a permanent path, not a migration step.
 *
 * Every number comes from the engine's summary; the live tally is the last resort only.
 */
export function StudyComplete({
  summary,
  resolved,
  elapsedSeconds,
  tally,
  onDone,
  onReviewAgain,
  onDrillWeak,
  starting,
  error,
  shadowing,
}: Props) {
  const { t } = useTranslation('study');
  const insights = summary?.session_insights;
  const srs = summary?.srs_stats;
  const xp = summary?.xp_earned ?? 0;

  const sess = summary?.session;
  const useServerCounts = (sess?.activities_total ?? 0) > 0;
  const total = useServerCounts ? (sess?.activities_total ?? 0) : tally.correct + tally.incorrect;
  const correct = useServerCounts ? (sess?.activities_correct ?? 0) : tally.correct;
  const incorrect = Math.max(0, total - correct);
  const accuracy = pct(correct, total);
  const elapsed =
    useServerCounts && sess?.total_seconds != null ? sess.total_seconds : elapsedSeconds;

  const hasSrs =
    !!srs &&
    (srs.dues_reviewed ||
      srs.new_learned ||
      srs.promotions ||
      srs.demotions ||
      srs.newly_mastered ||
      srs.tomorrow_forecast);

  const srsGrid = srs && hasSrs && (
    <ReportPanel title={t('summary')} testId="report-srs">
      <div className="grid grid-cols-2 gap-2">
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
    </ReportPanel>
  );

  let body: React.ReactNode;
  if (!resolved) {
    body = <ReportSkeleton />;
  } else if (shadowing && !insights) {
    body = (
      <SessionHero
        headline={t('shadowing.doneTitle')}
        facts={[`${t('complete.time')} ${formatClock(elapsed)}`]}
        xp={xp}
        xpLabel={t('complete.xpEarned')}
      />
    );
  } else if (insights && insights.unique_cards > 0) {
    const headline = headlineOf(insights, srs?.newly_mastered ?? 0);
    const f = factsOf(insights);
    const facts = [
      t('report.factSeen', { count: f.seen }),
      t('report.factFirstTry', { percent: f.firstTryPercent }),
      t('report.factActive', {
        time:
          f.hours > 0
            ? t('report.durationHm', { hours: f.hours, minutes: f.minutes })
            : t('report.durationM', { minutes: f.minutes }),
      }),
    ];
    body = (
      <>
        <SessionHero
          headline={t(`report.${headline.key}`, { count: headline.count })}
          facts={facts}
          xp={xp}
          xpLabel={t('complete.xpEarned')}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <RecallPanel insights={insights} />
          {srsGrid}
        </div>
        <StrugglePanel struggles={insights.struggles} onDrill={onDrillWeak} drilling={starting} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ForecastPanel forecast={insights.forecast} />
          <LevelPanel byLevel={insights.by_level} />
        </div>
        <DeckPanel decks={summary?.per_deck_counts ?? []} />
      </>
    );
  } else {
    const ringTone =
      accuracy >= 80 ? 'text-success' : accuracy >= 50 ? 'text-warning' : 'text-error';
    const barTone = accuracy >= 80 ? 'bg-success' : accuracy >= 50 ? 'bg-warning' : 'bg-error';
    body = (
      <>
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-bold text-foreground">{t('complete.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {total === 0 ? t('runner.feedbackEmpty') : t('complete.reviewed') + `: ${total}`}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
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
                <span className="font-semibold text-foreground">{formatClock(elapsed)}</span>
              </span>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full transition-all duration-500', barTone)}
              style={{ width: `${accuracy}%` }}
            />
          </div>
        </div>
        {xp > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Zap className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">{t('complete.xpEarned')}</div>
              <div className="text-[11px] text-muted-foreground">{t('complete.xpHint')}</div>
            </div>
            <div className="text-xl font-black tabular-nums text-primary">+{xp}</div>
          </div>
        )}
        {srsGrid}
        <DeckPanel decks={summary?.per_deck_counts ?? []} />
      </>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4 sm:p-6"
      data-testid="study-complete"
    >
      {body}
      {error && (
        <div className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2.5 py-3">
        <Button
          variant="accent"
          size="lg"
          onClick={onReviewAgain}
          loading={starting}
          disabled={!resolved}
        >
          <RotateCcw className="h-4 w-4" />
          {t('complete.reviewAgain')}
        </Button>
        <Button variant="outline" size="lg" onClick={onDone} disabled={starting}>
          {t('complete.done')}
        </Button>
      </div>
    </div>
  );
}
