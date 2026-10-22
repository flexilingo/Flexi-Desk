import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Edit3, Flame, Sparkles } from 'lucide-react';
import { OverviewCard } from './parts';
import { ManualStudyDialog } from './ManualStudyDialog';
import { localMinutes, levelFromXp, xpForLevel, ymd } from './model';
import type { OverviewData } from './useOverviewData';

/** Streak with the last seven days as dots, the level and its progress, today's minutes and XP, and a pencil for logging time by hand. */
export function TodayStatusBar({ data }: { data: OverviewData }) {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useState(false);
  const todayStr = ymd(data.now);
  const byDate = new Map((data.activity?.days ?? []).map((d) => [d.date, d]));
  const today = byDate.get(todayStr);
  const dots = data.week.map((d, i) => ({
    key: ymd(d.date),
    active: d.minutes > 0,
    isToday: i === data.week.length - 1,
  }));

  const level = levelFromXp(data.xpTotal);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  const pct = Math.min(100, Math.max(0, ((data.xpTotal - from) / (to - from)) * 100));
  const toNext = Math.max(0, to - data.xpTotal);
  const minutes = data.week[data.week.length - 1]?.minutes ?? 0;
  const lit = data.streak > 0;

  return (
    <>
      <OverviewCard as="div" className="flex flex-wrap items-center gap-x-7 gap-y-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${lit ? 'bg-warning/15' : 'bg-muted'}`}
          >
            <Flame
              className={`h-[18px] w-[18px] ${lit ? 'text-warning' : 'text-muted-foreground'}`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[17px] font-black leading-none text-foreground">
                {data.streak}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {t('statusBar.streakDays')}
              </span>
              {data.bestStreak > 0 && (
                <span className="hidden text-[10.5px] text-muted-foreground sm:inline">
                  · {t('statusBar.bestStreak', { count: data.bestStreak })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-[5px]">
              {dots.map((d) => (
                <span
                  key={d.key}
                  className={`h-2 w-2 rounded-full ${d.active ? 'bg-success' : d.isToday ? 'border border-dashed border-primary/60 bg-transparent' : 'bg-muted'}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="hidden h-9 w-px bg-border sm:block" />

        <div className="flex min-w-[160px] items-center gap-3">
          <div className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
            <span className="text-[13px] font-extrabold leading-none">
              {t('statusBar.levelShort', { level: data.level })}
            </span>
          </div>
          {data.levelIsLocal && (
            <div className="min-w-[90px] flex-1">
              <div className="h-[6px] overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 text-[10.5px] text-muted-foreground">
                {t('xp.toNextLevel', { xp: toNext })}
              </div>
            </div>
          )}
        </div>

        <div className="ms-auto flex items-center gap-2.5">
          <span className="hidden text-[11.5px] font-medium text-muted-foreground sm:inline">
            {t('statusBar.today')}
          </span>
          {minutes > 0 && (
            <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">
                {t('statusBar.minutesToday', { minutes })}
              </span>
            </div>
          )}
          {data.xpToday > 0 && (
            <div className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs font-bold text-foreground">
                {t('statusBar.xpToday', { xp: data.xpToday })}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('manualStudy.title')}
            title={t('manualStudy.title')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </OverviewCard>

      <ManualStudyDialog
        open={open}
        onClose={() => setOpen(false)}
        selectedDate={todayStr}
        initialMinutes={today?.manual_minutes ?? 0}
        activityMinutes={today ? localMinutes({ ...today, manual_minutes: 0 }) : 0}
        signedIn={data.signedIn}
        onSaved={data.activityReload}
      />
    </>
  );
}
