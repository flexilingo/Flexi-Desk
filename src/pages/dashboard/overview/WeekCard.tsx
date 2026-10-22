import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Target } from 'lucide-react';
import { CardError, OverviewCard, linkClass } from './parts';
import { GoalDialog } from './dialogs';
import type { OverviewData } from './useOverviewData';

export const CALENDAR_ANCHOR = 'activity-calendar';

/**
 * The last seven days as bars (study, listening and reading time plus minutes
 * logged by hand) against the daily goal. "Whole year" scrolls down to the calendar.
 */
export function WeekCard({ data }: { data: OverviewData }) {
  const { t, i18n } = useTranslation('dashboard', { keyPrefix: 'home' });
  const { t: tGoal } = useTranslation('dashboard', { keyPrefix: 'goal' });
  const [goalOpen, setGoalOpen] = useState(false);
  const duration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? t('duration.hours', { h, m }) : t('duration.minutes', { m });
  };

  const days = data.week;
  const total = days.reduce((s, d) => s + d.minutes, 0);
  const goal = data.dailyGoalMinutes ?? 0;
  const max = Math.max(...days.map((d) => d.minutes), goal, 1) * 1.15;
  const active = days.filter((d) => d.minutes > 0).length;
  const empty = total === 0 && data.streak === 0;

  const toYear = () =>
    document
      .getElementById(CALENDAR_ANCHOR)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <OverviewCard labelledBy="week-title" className="flex min-h-[300px] flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="week-title" className="text-base font-bold text-foreground">
          {t('week.title')}
        </h2>
        <button type="button" onClick={toYear} className={linkClass}>
          {t('week.year')}
          <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
        </button>
      </div>

      {data.errors.activity ? (
        <CardError className="mt-4" onRetry={data.activityReload} />
      ) : (
        <>
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-black text-foreground">{duration(total)}</span>
            <span className="text-xs text-muted-foreground">{t('week.caption')}</span>
          </div>

          {empty && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t('week.emptyBody')}
            </p>
          )}

          <div
            className={`relative mt-6 grid grid-cols-7 grid-rows-1 items-end gap-2 ${empty ? 'h-14' : 'max-h-[200px] min-h-[96px] flex-1'}`}
          >
            {goal > 0 && !empty && (
              <div
                className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-primary/40"
                style={{ bottom: `${(goal / max) * 100}%` }}
              >
                <span className="absolute -top-[18px] end-0 bg-card px-1 text-[10.5px] text-muted-foreground">
                  {t('week.goal', { count: goal })}
                </span>
              </div>
            )}
            {days.map((d, i) => {
              const isToday = i === days.length - 1;
              const met = goal > 0 && d.minutes >= goal;
              return (
                <div
                  key={i}
                  title={duration(d.minutes)}
                  data-testid="week-bar"
                  data-minutes={d.minutes}
                  className={`rounded-b-sm rounded-t-md ${
                    d.minutes === 0 ? 'bg-muted' : met ? 'bg-primary' : 'bg-primary/35'
                  } ${isToday ? 'outline outline-2 outline-offset-2 outline-primary' : ''}`}
                  style={{
                    height: d.minutes === 0 ? 4 : `${Math.max(6, (d.minutes / max) * 100)}%`,
                  }}
                />
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2 text-center text-[11px] text-muted-foreground">
            {days.map((d, i) =>
              i === days.length - 1 ? (
                <span key={i} className="font-bold text-foreground">
                  {t('week.today')}
                </span>
              ) : (
                <span key={i}>
                  {d.date.toLocaleDateString(i18n.language, { weekday: 'narrow' })}
                </span>
              ),
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            {!empty ? <span>{t('week.activeDays', { count: active })}</span> : <span />}
            {!empty && data.bestStreak > 0 && (
              <span>{t('week.best', { count: data.bestStreak })}</span>
            )}
          </div>
          <div className="mt-1">
            <button type="button" onClick={() => setGoalOpen(true)} className={linkClass}>
              <Target className="h-3.5 w-3.5" />
              {goal > 0 ? tGoal('title') : tGoal('set')}
            </button>
          </div>
        </>
      )}

      <GoalDialog open={goalOpen} onOpenChange={setGoalOpen} data={data} />
    </OverviewCard>
  );
}
