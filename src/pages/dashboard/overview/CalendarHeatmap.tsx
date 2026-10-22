import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardError, OverviewCard } from './parts';
import { ManualStudyDialog } from './ManualStudyDialog';
import { localMinutes, ymd, type ActivityDay } from './model';
import type { OverviewData } from './useOverviewData';

const INTENSITY = [
  'bg-muted',
  'bg-success/40',
  'bg-success/65',
  'bg-success',
  'bg-success/80 brightness-75',
];
const WEEKS = 53;

interface Cell {
  date: string;
  intensity: number;
  day: ActivityDay | undefined;
  total: number;
  future: boolean;
}

/** The whole year, one square per day: study, listening, reading and minutes logged by hand. */
export function CalendarHeatmap({ data }: { data: OverviewData }) {
  const { t, i18n } = useTranslation('dashboard', { keyPrefix: 'heatmap' });
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ cell: Cell; x: number; y: number } | null>(null);

  const todayStr = ymd(data.now);
  const byDate = useMemo(
    () => new Map((data.activity?.days ?? []).map((d) => [d.date, d])),
    [data.activity],
  );

  const weeks = useMemo(() => {
    const end = new Date(data.now);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (WEEKS - 1) * 7 - end.getDay());
    return Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d): Cell => {
        const date = new Date(start);
        date.setDate(date.getDate() + w * 7 + d);
        const key = ymd(date);
        const day = byDate.get(key);
        const total = localMinutes(day);
        return {
          date: key,
          day,
          total,
          future: key > todayStr,
          intensity: Math.max(0, Math.min(4, Math.floor((day?.reviews ?? 0) / 10 + total / 5))),
        };
      }),
    );
  }, [byDate, data.now, todayStr]);

  const activeDays = data.activity?.active_days ?? 0;
  const label = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  const weekdayName = (i: number) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(i18n.language, { weekday: 'narrow' });
  const sel = selected ? byDate.get(selected) : undefined;

  return (
    <OverviewCard labelledBy="heatmap-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Calendar className="h-3.5 w-3.5" />
          </span>
          <h2 id="heatmap-title" className="text-sm font-bold text-foreground">
            {t('title')}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.streak > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-bold text-warning">
              <span className="text-sm">{data.streak.toLocaleString(i18n.language)}</span>
              {t('consecutiveDays')}
            </div>
          )}
          {activeDays > 0 && (
            <div className="hidden text-[11.5px] text-muted-foreground sm:block">
              {t('activeDays')}{' '}
              <strong className="font-semibold text-foreground">
                {activeDays.toLocaleString(i18n.language)}
              </strong>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelected(todayStr)}
            className="inline-flex"
          >
            <Plus className="h-4 w-4" />
            {t('addManualTime')}
          </Button>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3">
        {data.errors.activity ? (
          <CardError onRetry={data.activityReload} />
        ) : (
          <>
            <p className="mb-3 text-[11.5px] text-muted-foreground">{t('clickToEdit')}</p>
            <div className="overflow-x-auto pb-1">
              <div className="inline-flex gap-[3px]" dir="ltr">
                <div className="mr-0.5 flex shrink-0 flex-col gap-[3px]">
                  <div className="h-[13px]" />
                  {Array.from({ length: 7 }, (_, i) => (
                    <div
                      key={i}
                      className="flex h-3 w-[18px] items-center justify-end pr-0.5 text-[9.5px] text-muted-foreground"
                    >
                      {i % 2 === 1 ? weekdayName(i) : ''}
                    </div>
                  ))}
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    <div className="h-[13px] overflow-visible whitespace-nowrap text-center text-[9.5px] text-muted-foreground">
                      {new Date(`${week[0].date}T00:00:00`).getDate() <= 7
                        ? new Date(`${week[0].date}T00:00:00`).toLocaleDateString(i18n.language, {
                            month: 'short',
                          })
                        : ''}
                    </div>
                    {week.map((cell) => {
                      const ring =
                        cell.date === todayStr
                          ? 'ring-2 ring-primary'
                          : (cell.day?.manual_minutes ?? 0) > 0
                            ? 'ring-[1.5px] ring-success'
                            : '';
                      return (
                        <button
                          key={cell.date}
                          type="button"
                          disabled={cell.future}
                          data-date={cell.date}
                          data-intensity={cell.intensity}
                          aria-label={`${label(cell.date)}: ${cell.total} ${t('minutes')}`}
                          className={`h-3 w-3 rounded-[3px] transition-transform ${INTENSITY[cell.intensity]} ${ring} ${
                            cell.future
                              ? 'cursor-not-allowed opacity-30'
                              : 'cursor-pointer hover:scale-125 hover:opacity-80'
                          }`}
                          onClick={() => setSelected(cell.date)}
                          onMouseEnter={(e) =>
                            !cell.future && setHovered({ cell, x: e.clientX, y: e.clientY })
                          }
                          onMouseLeave={() => setHovered(null)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3.5 flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">{t('less')}</span>
              <div className="flex items-center gap-[3px]">
                {INTENSITY.map((cls, level) => (
                  <div key={level} className={`h-3 w-3 rounded-[3px] ${cls}`} />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground">{t('more')}</span>
              <span className="ms-2 hidden text-[10px] text-muted-foreground sm:inline">
                {t('ringLegend')}
              </span>
            </div>
          </>
        )}
      </div>

      {hovered && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-background shadow-lg"
          style={{ left: Math.min(hovered.x + 10, window.innerWidth - 200), top: hovered.y + 10 }}
        >
          <div className="mb-1 font-bold">{label(hovered.cell.date)}</div>
          <div className="space-y-0.5">
            <div>
              {t('cardsReviewed')} {hovered.cell.day?.reviews ?? 0}
            </div>
            <div>
              {t('studyLabel')} {hovered.cell.day?.study_minutes ?? 0} {t('minutes')}
            </div>
            <div>
              {t('listenLabel')} {Math.round((hovered.cell.day?.listen_seconds ?? 0) / 60)}{' '}
              {t('minutes')}
            </div>
            <div>
              {t('readLabel')} {Math.round((hovered.cell.day?.read_seconds ?? 0) / 60)}{' '}
              {t('minutes')}
            </div>
            {(hovered.cell.day?.manual_minutes ?? 0) > 0 && (
              <div>
                {t('manualTimeLabel')} {hovered.cell.day?.manual_minutes} {t('minutes')}
              </div>
            )}
            <div className="mt-0.5 border-t border-background/20 pt-0.5 font-bold">
              {t('total')} {hovered.cell.total} {t('minutes')}
            </div>
          </div>
        </div>
      )}

      <ManualStudyDialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        selectedDate={selected ?? undefined}
        initialMinutes={sel?.manual_minutes ?? 0}
        activityMinutes={
          sel ? sel.study_minutes + Math.round((sel.listen_seconds + sel.read_seconds) / 60) : 0
        }
        signedIn={data.signedIn}
        onSaved={data.activityReload}
      />
    </OverviewCard>
  );
}
