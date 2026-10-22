/**
 * One recurring mistake, taught properly.
 *
 * The shape is deliberate and is the pedagogy of the whole feature:
 *
 *   what happens          — the mechanism, neutrally
 *   why YOU fall for it   — grounded in this learner's own evidence
 *   the evidence          — 2-4 real questions, checkable
 *   the rule              — the transferable thing to remember
 *   the drill             — something to do tonight
 *
 * The "times seen" badge is the hook. A mistake made once is bad luck; a
 * mistake made fourteen times is a habit, and seeing the number is usually the
 * moment a learner starts taking it seriously. That count comes from Python,
 * not from the model, precisely so it is right.
 *
 * Rendered as a divided section rather than a nested card: it already lives
 * inside the skill panel, and the design system permits exactly one level of
 * card nesting.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Repeat, ChevronDown, Dumbbell } from 'lucide-react';
import type { CoachErrorPattern } from '../coachTypes';
import { EvidenceItem } from './EvidenceItem';
import { prettyPattern } from './shared';

export function ErrorPatternCard({
  pattern,
  examType,
}: {
  pattern: CoachErrorPattern;
  examType: string;
}) {
  const { t } = useTranslation('exam');
  const [drillOpen, setDrillOpen] = useState(false);
  const drill = pattern.drill;
  const hasDrill = Boolean(drill?.instruction || drill?.items?.length);

  return (
    <article className="px-4 py-4 space-y-3">
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-[13px] font-bold text-foreground leading-snug min-w-0">
          {pattern.name || prettyPattern(pattern.pattern_id)}
        </h3>
        {pattern.times_seen != null && pattern.times_seen > 1 && (
          <span className="inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full bg-warning/[0.16] text-warning text-[10.5px] font-bold tabular-nums">
            <Repeat className="w-2.5 h-2.5" />
            {t('coach.timesSeen', { count: pattern.times_seen })}
          </span>
        )}
      </header>

      {pattern.what_happens && (
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
          {pattern.what_happens}
        </p>
      )}

      {pattern.why_you_fall_for_it && (
        <p className="text-[12.5px] text-foreground leading-relaxed">
          <span className="font-bold text-primary">{t('coach.whyYouFallForIt')}: </span>
          {pattern.why_you_fall_for_it}
        </p>
      )}

      {(pattern.evidence?.length ?? 0) > 0 && (
        <div className="space-y-3 pt-0.5">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-caption">
            {t('coach.evidenceHeading', { count: pattern.evidence!.length })}
          </p>
          {pattern.evidence!.map((e, i) => (
            <EvidenceItem key={e.ref || i} evidence={e} examType={examType} />
          ))}
        </div>
      )}

      {pattern.the_rule && (
        <p className="text-[12.5px] text-foreground leading-relaxed rounded-[7px] bg-primary/[0.08] px-3 py-2.5">
          <span className="font-bold text-primary">{t('coach.theRule')}: </span>
          {pattern.the_rule}
        </p>
      )}

      {hasDrill && (
        <div>
          <button
            type="button"
            onClick={() => setDrillOpen((v) => !v)}
            aria-expanded={drillOpen}
            className="inline-flex items-center gap-2 text-[12px] font-bold text-primary hover:text-primary transition-colors"
          >
            <Dumbbell className="w-3.5 h-3.5" />
            {t('coach.drill')}
            {drill?.minutes ? (
              <span className="font-semibold text-caption tabular-nums">
                {t('coach.minutes', { count: drill.minutes })}
              </span>
            ) : null}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${drillOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {drillOpen && (
            <div className="mt-2.5 space-y-2.5 border-s-2 border-primary/30 ps-3">
              {drill?.instruction && (
                <p className="text-[12.5px] text-foreground leading-relaxed">{drill.instruction}</p>
              )}
              {(drill?.items?.length ?? 0) > 0 && (
                <ol dir="ltr" className="text-left space-y-1.5 list-decimal ps-5">
                  {drill!.items!.map((item, i) => (
                    <li key={i} className="text-[12.5px] text-foreground leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ol>
              )}
              {(drill?.answers?.length ?? 0) > 0 && (
                // <details> so the answers are one deliberate click away — a
                // drill whose answers are already visible is a reading exercise.
                <details>
                  <summary className="cursor-pointer text-[11.5px] font-semibold text-primary hover:text-primary list-none">
                    {t('coach.showAnswers')}
                  </summary>
                  <ol dir="ltr" className="text-left mt-2 space-y-1 list-decimal ps-5">
                    {drill!.answers!.map((a, i) => (
                      <li key={i} className="text-[12.5px] text-success leading-relaxed">
                        {a}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
