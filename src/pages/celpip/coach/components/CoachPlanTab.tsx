/**
 * What to do about it: the grammar curriculum, the vocabulary, the fourteen
 * days, and the exam-room strategy.
 *
 * The plan is the payoff. Everything before it explains the problem; this is
 * the part a learner opens tomorrow morning. Each day expands on click so the
 * whole fortnight is scannable but only today's tasks are in the way.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  GraduationCap,
  BookMarked,
  Compass,
  ChevronDown,
  MapPin,
  Check,
  X,
} from 'lucide-react';
import type { CoachReportBody } from '../coachTypes';
import { PANEL } from './shared';

export function CoachPlanTab({ body }: { body: CoachReportBody }) {
  const { t } = useTranslation('exam');
  const plan = body.action_plan_14_day;
  const vocab = body.vocabulary;
  const [openDay, setOpenDay] = useState<number | null>(1);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {(plan?.days?.length ?? 0) > 0 && (
        <section className={PANEL}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <span className="w-7 h-7 rounded-[7px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
              <CalendarDays className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-[13px] font-bold text-foreground">{t('coach.planTitle')}</h2>
          </div>

          {plan!.principle && (
            <p className="px-4 py-3 text-[12.5px] text-muted-foreground leading-relaxed border-b border-border">
              {plan!.principle}
            </p>
          )}

          <ol className="divide-y divide-border">
            {plan!.days!.map((day) => {
              const n = day.day ?? 0;
              const open = openDay === n;
              const total = (day.tasks ?? []).reduce((s, k) => s + (k.minutes ?? 0), 0);
              return (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => setOpenDay(open ? null : n)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-3 px-4 py-3 text-start hover:bg-muted transition-colors"
                  >
                    <span className="w-7 h-7 rounded-[7px] bg-muted text-foreground text-[11.5px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                      {n}
                    </span>
                    <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-foreground truncate">
                      {day.focus}
                    </span>
                    {total > 0 && (
                      <span className="text-[11px] text-caption tabular-nums shrink-0">
                        {t('coach.minutes', { count: total })}
                      </span>
                    )}
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-caption shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {open && (day.tasks?.length ?? 0) > 0 && (
                    <ul className="px-4 pb-3 ps-14 space-y-2.5">
                      {day.tasks!.map((task, i) => (
                        <li key={i} className="border-s-2 border-border ps-3">
                          <p className="text-[12.5px] text-foreground leading-relaxed">
                            {task.what}
                            {task.minutes ? (
                              <span className="ms-1.5 text-[11px] text-caption tabular-nums">
                                {t('coach.minutes', { count: task.minutes })}
                              </span>
                            ) : null}
                          </p>
                          {task.where && (
                            <p className="flex items-center gap-1 text-[11.5px] text-primary font-semibold mt-0.5">
                              <MapPin className="w-2.5 h-2.5 shrink-0" />
                              {task.where}
                            </p>
                          )}
                          {task.success_looks_like && (
                            <p className="text-[11.5px] text-caption mt-0.5 leading-relaxed">
                              {task.success_looks_like}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>

          {(plan!.weekly_checkpoint?.length ?? 0) > 0 && (
            <div className="px-4 py-3 border-t border-border bg-muted">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-caption">
                {t('coach.checkpoints')}
              </p>
              <ul className="mt-1.5 space-y-1">
                {plan!.weekly_checkpoint!.map((c, i) => (
                  <li key={i} className="text-[12px] text-foreground leading-relaxed">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {(body.grammar_syllabus?.length ?? 0) > 0 && (
        <section className={PANEL}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <span className="w-7 h-7 rounded-[7px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
              <GraduationCap className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-[13px] font-bold text-foreground">{t('coach.grammarSyllabus')}</h2>
          </div>
          <ol className="divide-y divide-border">
            {body.grammar_syllabus!.map((g, i) => (
              <li key={i} className="px-4 py-4 space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 dir="ltr" className="text-left text-[13px] font-bold text-foreground">
                    {g.item}
                  </h3>
                  {g.times_seen != null && (
                    <span className="text-[11px] font-semibold text-warning tabular-nums shrink-0">
                      {t('coach.timesSeen', { count: g.times_seen })}
                    </span>
                  )}
                </div>
                {g.explanation && (
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                    {g.explanation}
                  </p>
                )}
                {(g.your_errors?.length ?? 0) > 0 && (
                  <ul dir="ltr" className="text-left space-y-1 border-s-2 border-border ps-3">
                    {g.your_errors!.map((e, j) => (
                      <li key={j} className="text-[12px] leading-relaxed">
                        <span className="text-muted-foreground line-through decoration-danger-500/40">
                          {e.yours}
                        </span>
                        <span className="mx-1.5 text-caption">→</span>
                        <span className="text-foreground font-semibold">{e.fixed}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {vocab && (
        <section className={PANEL}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <span className="w-7 h-7 rounded-[7px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
              <BookMarked className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-[13px] font-bold text-foreground">{t('coach.vocabulary')}</h2>
          </div>

          <div className="px-4 py-4 space-y-4">
            {(vocab.gaps_observed?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-caption">
                  {t('coach.wordsThatCostYou')}
                </p>
                {vocab.gaps_observed!.map((g, i) => (
                  <p key={i} className="text-[12.5px] leading-relaxed">
                    <span dir="ltr" className="font-bold text-foreground">
                      {g.word}
                    </span>
                    {g.cefr ? (
                      <span className="ms-1.5 text-[11px] text-caption">{g.cefr}</span>
                    ) : null}
                    {g.actual ? <span className="text-muted-foreground"> — {g.actual}</span> : null}
                  </p>
                ))}
              </div>
            )}

            {(vocab.upgrade_pairs?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-caption">
                  {t('coach.upgradeYourWording')}
                </p>
                {vocab.upgrade_pairs!.map((p, i) => (
                  <p key={i} dir="ltr" className="text-left text-[12.5px] leading-relaxed">
                    <span className="text-muted-foreground">{p.you_use}</span>
                    <span className="mx-1.5 text-caption">→</span>
                    <span className="text-foreground font-semibold">{p.use_instead}</span>
                    {p.register ? (
                      <span className="ms-1.5 text-[11px] text-caption">({p.register})</span>
                    ) : null}
                  </p>
                ))}
              </div>
            )}

            {(vocab.must_learn?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-caption mb-1.5">
                  {t('coach.mustLearn')}
                </p>
                <div dir="ltr" className="text-left flex flex-wrap gap-1.5">
                  {vocab.must_learn!.map((w, i) => (
                    <span
                      key={i}
                      title={w.why}
                      className="px-2 py-0.5 rounded-[7px] bg-muted border border-border text-[11.5px] text-foreground"
                    >
                      {w.word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {(body.exam_strategy?.length ?? 0) > 0 && (
        <section className={PANEL}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <span className="w-7 h-7 rounded-[7px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
              <Compass className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-[13px] font-bold text-foreground">{t('coach.examStrategy')}</h2>
          </div>
          <ul className="divide-y divide-border">
            {body.exam_strategy!.map((s, i) => (
              <li key={i} className="px-4 py-3">
                <p className="text-[12.5px] font-semibold text-foreground">{s.situation}</p>
                {s.do && (
                  <p className="flex gap-1.5 text-[12.5px] text-success mt-1 leading-relaxed">
                    <Check className="w-3 h-3 shrink-0 mt-[4px]" />
                    {s.do}
                  </p>
                )}
                {s.dont && (
                  <p className="flex gap-1.5 text-[12.5px] text-error mt-0.5 leading-relaxed">
                    <X className="w-3 h-3 shrink-0 mt-[4px]" />
                    {s.dont}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
