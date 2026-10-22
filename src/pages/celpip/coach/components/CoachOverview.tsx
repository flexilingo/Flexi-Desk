/**
 * The first screen of the report: the verdict, what changed since last time,
 * and the three things holding the score down.
 *
 * `progress_since_last` renders nothing at all on a first report. The generator
 * is explicitly forbidden from inventing a trend from one sitting, so a null
 * here is correct and an empty "no change yet" block would be noise.
 */

import { useTranslation } from 'react-i18next';
import { Quote, TrendingUp, CheckCircle2, AlertTriangle, Zap } from 'lucide-react';
import type { CoachReportBody } from '../coachTypes';
import { PANEL, prettyPattern } from './shared';

export function CoachOverview({ body }: { body: CoachReportBody }) {
  const { t } = useTranslation('exam');
  const head = body.headline ?? {};
  const progress = body.progress_since_last;
  const ceiling = head.predicted_ceiling;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* The verdict — the most important paragraph in the document. */}
      {head.verdict && (
        <section className={`${PANEL} overflow-hidden`}>
          <div className="h-[3px] bg-gradient-to-r from-primary to-primary/70" />
          <div className="p-4 sm:p-5">
            <div className="flex gap-3">
              <Quote className="w-4 h-4 text-primary shrink-0 mt-1" />
              <p className="text-[14px] text-foreground leading-relaxed">{head.verdict}</p>
            </div>

            {head.single_biggest_blocker && (
              <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-3 ps-7">
                <span className="font-bold text-foreground">{t('coach.biggestBlocker')}: </span>
                {head.single_biggest_blocker}
              </p>
            )}
          </div>

          {ceiling?.clb != null && (
            <div className="px-4 sm:px-5 py-3 border-t border-border bg-muted">
              <p className="text-[12.5px] text-foreground leading-relaxed">
                <span className="font-bold">
                  {t('coach.ceiling', { clb: ceiling.clb })}
                  {ceiling.by ? ` · ${ceiling.by}` : ''}
                </span>
                {ceiling.if ? ` — ${ceiling.if}` : ''}
              </p>
            </div>
          )}
        </section>
      )}

      {(head.quick_wins?.length ?? 0) > 0 && (
        <section className={PANEL}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <span className="w-7 h-7 rounded-[7px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-[13px] font-bold text-foreground">{t('coach.quickWins')}</h2>
          </div>
          <ul className="divide-y divide-border">
            {head.quick_wins!.map((w, i) => (
              <li key={i} className="px-4 py-3">
                <p className="text-[12.5px] font-semibold text-foreground leading-relaxed">
                  {w.title}
                </p>
                <p className="text-[11.5px] text-caption mt-1">
                  {[w.expected_gain, w.effort].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {progress && (
        <section className={PANEL}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <span className="w-7 h-7 rounded-[7px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-[13px] font-bold text-foreground">{t('coach.sinceLastReport')}</h2>
          </div>

          <div className="px-4 py-4 space-y-4">
            {(progress.moved?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2">
                {progress.moved!.map((m, i) => {
                  const up = (m.to ?? 0) >= (m.from ?? 0);
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] text-[11.5px] font-semibold tabular-nums ${
                        up ? 'bg-success/[0.12] text-success' : 'bg-error/[0.10] text-error'
                      }`}
                    >
                      {m.metric} {m.from} → {m.to}
                    </span>
                  );
                })}
              </div>
            )}

            {/* The most motivating block available: things that stopped happening. */}
            {(progress.fixed?.length ?? 0) > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-success">
                  <CheckCircle2 className="w-3 h-3" />
                  {t('coach.fixed')}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {progress.fixed!.map((f, i) => (
                    <li key={i} className="text-[12.5px] text-foreground leading-relaxed">
                      <span className="font-semibold">{prettyPattern(f.pattern_id)}</span>
                      {f.evidence ? ` — ${f.evidence}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(progress.still_broken?.length ?? 0) > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-caption">
                  <AlertTriangle className="w-3 h-3" />
                  {t('coach.stillBroken')}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {progress.still_broken!.map((s, i) => (
                    <li key={i} className="text-[12.5px] text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-foreground">
                        {prettyPattern(s.pattern_id)}
                      </span>
                      {s.times_seen ? ` (${t('coach.timesSeen', { count: s.times_seen })})` : ''}
                      {s.note ? ` — ${s.note}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {progress.adherence && (
              <p className="text-[12.5px] text-foreground leading-relaxed rounded-[7px] bg-muted px-3 py-2.5">
                {progress.adherence}
              </p>
            )}
          </div>
        </section>
      )}

      {(body.top_blockers?.length ?? 0) > 0 && (
        <section className={PANEL}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <span className="w-7 h-7 rounded-[7px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-[13px] font-bold text-foreground">{t('coach.topBlockers')}</h2>
          </div>
          <ol className="divide-y divide-border">
            {body.top_blockers!.map((b, i) => (
              <li key={i} className="px-4 py-4 flex gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/[0.12] text-primary text-[12px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                  {b.rank ?? i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-bold text-foreground leading-snug">{b.title}</h3>
                  {b.costing_you && (
                    <p className="text-[11.5px] text-warning font-semibold mt-0.5">
                      {b.costing_you}
                      {b.time_to_fix ? ` · ${b.time_to_fix}` : ''}
                    </p>
                  )}
                  {b.fix && (
                    <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-1.5">
                      {b.fix}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {body.encouragement && (
        <section className={`${PANEL} px-4 py-4`}>
          <p className="text-[13px] text-foreground leading-relaxed italic">{body.encouragement}</p>
        </section>
      )}
    </div>
  );
}
