/**
 * What this report is, and what it was written from.
 *
 * This block is the answer to the only question a learner has when they arrive
 * from an email: "is this actually about me?" So it leads with the evidence —
 * how many sessions, how many are new since last time, over what dates, and how
 * many questions, essays and spoken answers were read — before it shows a
 * single score.
 *
 * The confidence chip is deliberately visible. A report built on two practice
 * sessions should say so; hiding that would make the one built on twenty look
 * no more trustworthy.
 */

import { useTranslation } from 'react-i18next';
import { Compass, FileQuestion, PenLine, Mic } from 'lucide-react';
import type { CoachReportBody, CoachReportRow } from '../coachTypes';
import { PANEL, SKILL_TONE, SKILLS, formatDate } from './shared';

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'bg-success/[0.14] text-success',
  medium: 'bg-warning/[0.16] text-warning',
  low: 'bg-muted text-muted-foreground',
};

export function CoachHeader({ row, body }: { row: CoachReportRow; body: CoachReportBody }) {
  const { t, i18n } = useTranslation('exam');
  const locale = i18n.language;
  const cov = body.meta?.covered;
  const est = body.headline?.current_estimate ?? {};
  const confidence = body.meta?.confidence;

  const total = cov?.sessions_total ?? row.covered_session_ids?.length ?? 0;
  const fresh = row.new_session_count ?? cov?.sessions_new ?? 0;
  const from = formatDate(row.covered_from ?? cov?.from, locale);
  const to = formatDate(row.covered_to ?? cov?.to, locale);

  const evidence: Array<{ icon: typeof FileQuestion; value?: number; label: string }> = [
    { icon: FileQuestion, value: cov?.mcq_questions_reviewed, label: t('coach.questionsReviewed') },
    { icon: PenLine, value: cov?.writing_tasks, label: t('coach.writingTasks') },
    { icon: Mic, value: cov?.speaking_tasks, label: t('coach.speakingTasks') },
  ];

  return (
    <section className={`${PANEL} overflow-hidden`}>
      <div className="h-[3px] bg-gradient-to-r from-primary to-primary/70" />

      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3 flex-wrap">
          <span className="w-9 h-9 rounded-[10px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[15px] font-bold text-foreground">
                {t('coach.cardTitle', { index: row.report_index })}
              </h1>
              {confidence && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                    CONFIDENCE_TONE[confidence] ?? CONFIDENCE_TONE.low
                  }`}
                >
                  {t(`coach.confidence.${confidence}`)}
                </span>
              )}
            </div>

            {/* The coverage line — the whole point of this header. */}
            <p className="text-[12.5px] text-muted-foreground mt-1 tabular-nums">
              {fresh > 0 && fresh < total
                ? t('coach.coverageWithNew', { total, fresh })
                : t('coach.coverage', { total })}
              {from && to ? ` · ${from} — ${to}` : ''}
            </p>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {evidence
                .filter((e) => (e.value ?? 0) > 0)
                .map(({ icon: Icon, value, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 text-[11.5px] text-caption tabular-nums"
                  >
                    <Icon className="w-3 h-3" />
                    {value} {label}
                  </span>
                ))}
            </div>
          </div>
        </div>

        {SKILLS.some((s) => est[s] != null) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {SKILLS.map((skill) => {
              const value = est[skill];
              if (value == null) return null;
              const tone = SKILL_TONE[skill];
              const Icon = tone.icon;
              return (
                <div key={skill} className="rounded-[7px] bg-muted px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Icon className={`w-3 h-3 ${tone.text}`} />
                    {t(skill)}
                  </p>
                  <p className="text-[16px] font-bold text-foreground tabular-nums mt-0.5">
                    {value}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {body.meta?.confidence_reason && (
          <p className="text-[11.5px] text-caption leading-relaxed mt-3">
            {body.meta.confidence_reason}
          </p>
        )}
      </div>
    </section>
  );
}
