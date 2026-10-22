/**
 * Every report this learner has had.
 *
 * Reports are never deleted, and each one references the one before it, so the
 * history is a record of what actually changed over months. Reads only the
 * denormalized columns — the bodies stay on the server.
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { useCoachReportList } from '../useCoach';
import { PANEL, shortDate } from './shared';

export function CoachReportHistory({
  examType,
  currentId,
}: {
  examType: string;
  currentId: string;
}) {
  const { t, i18n } = useTranslation('exam');
  const locale = i18n.language;
  const { data } = useCoachReportList(examType);
  const reports = data?.reports ?? [];

  if (reports.length < 2) return null;

  return (
    <section className={PANEL}>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <span className="w-7 h-7 rounded-[7px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
          <History className="w-3.5 h-3.5" />
        </span>
        <h2 className="text-[13px] font-bold text-foreground">{t('coach.history')}</h2>
      </div>

      <ul className="divide-y divide-border">
        {reports.map((r) => {
          const active = r.id === currentId;
          return (
            <li key={r.id}>
              <Link
                to={`/exam/${examType}/coach/${r.id}`}
                aria-current={active ? 'page' : undefined}
                className={`block px-4 py-3 transition-colors ${
                  active ? 'bg-muted' : 'hover:bg-muted'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-bold text-foreground">
                    {t('coach.cardTitle', { index: r.report_index })}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {!r.read_at && (
                      <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden />
                    )}
                    <span className="text-[11px] text-caption tabular-nums">
                      {shortDate(r.generated_at, locale)}
                    </span>
                  </span>
                </div>
                <p className="text-[11px] text-caption mt-0.5 tabular-nums">
                  {t('coach.coverageShort', { fresh: r.new_session_count })}
                  {r.overall_clb != null ? ` · CLB ${r.overall_clb}` : ''}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
