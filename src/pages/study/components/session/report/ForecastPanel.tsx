import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { SessionInsights } from '../../../types';
import { dayLabelOf, forecastBars } from '../../../lib/studyReport';
import { ReportPanel } from './ReportPanel';

/**
 * The next days of due cards — the spaced-repetition promise made visible: the schedule
 * the learner just changed by studying, drawn as the days they will be asked to come back.
 * A number for tomorrow alone says nothing about whether the load is about to spike.
 */
export function ForecastPanel({ forecast }: { forecast: SessionInsights['forecast'] }) {
  const { t } = useTranslation('study');
  const bars = forecastBars(forecast);
  if (!bars) return null;
  const label = (offset: number) => {
    const l = dayLabelOf(offset);
    return l.key === 'today'
      ? t('report.today')
      : l.key === 'tomorrow'
        ? t('complete.tomorrowShort')
        : t('report.inDays', { count: l.count });
  };
  return (
    <ReportPanel title={t('report.forecastTitle')} testId="report-forecast">
      <div className="flex flex-col gap-1.5">
        {bars.map((d) => (
          <div key={d.offset} className="flex items-center gap-2.5">
            <span className="w-14 shrink-0 truncate text-[11px] font-semibold text-caption">
              {label(d.offset)}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
              {/* The heaviest day is the one worth noticing, so it alone takes the accent. */}
              <div
                className={cn('h-full rounded-full', d.isPeak ? 'bg-accent' : 'bg-primary/70')}
                style={{ width: `${d.width}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-end text-xs font-bold tabular-nums text-foreground">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </ReportPanel>
  );
}
