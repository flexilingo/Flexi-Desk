import { useTranslation } from 'react-i18next';
import type { SessionInsights } from '../../../types';
import { recallRates } from '../../../lib/studyReport';
import { ReportPanel } from './ReportPanel';

function Rate({
  label,
  value,
  total,
  pct,
  barClass,
}: {
  label: string;
  value: number;
  total: number;
  pct: number;
  barClass: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <span className="text-[13px] tabular-nums text-caption">
          <span className="text-lg font-black text-foreground">{pct}%</span>
          <span className="ms-1.5">
            {value}/{total}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barClass} transition-[width] duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Two rates, not one. `firstTry` is how much was retained coming in; `byTheEnd` is where
 * the learner finished after the session re-showed what they missed. The DISTANCE between
 * the two bars is the work the session did — one accuracy number destroys exactly that.
 */
export function RecallPanel({ insights }: { insights: SessionInsights }) {
  const { t } = useTranslation('study');
  const r = recallRates(insights);
  if (r.total === 0) return null;
  return (
    <ReportPanel title={t('report.recallTitle')} testId="report-recall">
      <div className="flex flex-col gap-3.5">
        <Rate
          label={t('report.firstTry')}
          value={r.firstTry.value}
          total={r.total}
          pct={r.firstTry.pct}
          barClass="bg-primary"
        />
        <Rate
          label={t('report.byTheEnd')}
          value={r.byTheEnd.value}
          total={r.total}
          pct={r.byTheEnd.pct}
          barClass="bg-success"
        />
      </div>
      <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-caption">
        {t('report.attemptsNote', { attempts: r.attempts, cards: r.total, avg: r.avgAttempts })}
        {r.gained > 0 && <> · {t('report.gapNote', { count: r.gained })}</>}
      </p>
    </ReportPanel>
  );
}
