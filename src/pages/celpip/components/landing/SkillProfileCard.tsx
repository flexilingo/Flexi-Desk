/**
 * What practice is actually worth.
 *
 * The stat cards above answer "what is my official score" and refuse to guess.
 * This panel answers the question a learner who has only ever done practice
 * still deserves an answer to — "where am I?" — without inventing an overall
 * band out of one section.
 *
 * Two honesty rules drive the whole design:
 *
 *  - Per skill, partial coverage weakens the CONFIDENCE, not the score. A
 *    learner who did 1 of 4 reading parts and scored 9 is shown 9 with a
 *    quarter-full coverage bar, never a scaled-down 2.25.
 *  - The overall is a minimum, so a subset of skills gives an UPPER bound. While
 *    any skill is unmeasured the number carries a ≤ and says which skills are
 *    still missing. It can never over-promise.
 *
 * Colour: the hero owns the page's terra CTA, so this panel takes an olive
 * stripe and tile. The four skill hues are marks only — a 20px letter chip and a
 * 3px coverage bar — and they repeat the identity the section pills and the
 * progress chart already teach.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Info } from 'lucide-react';
import {
  SKILL_KEYS,
  buildSkillProfile,
  overallEstimate,
  type SkillKey,
} from '../../utils/skillProfile';
import type { ExamSession } from '../../types';

/** Literal class strings — Tailwind's scanner cannot follow a concatenation. */
const SKILL_TONE: Record<SkillKey, { chip: string; text: string; bar: string }> = {
  listening: { chip: 'bg-primary', text: 'text-primary', bar: 'bg-primary' },
  reading: { chip: 'bg-primary', text: 'text-primary', bar: 'bg-primary' },
  writing: { chip: 'bg-primary', text: 'text-primary', bar: 'bg-primary' },
  speaking: { chip: 'bg-primary', text: 'text-primary', bar: 'bg-primary' },
};

const SKILL_LETTER: Record<SkillKey, string> = {
  listening: 'L',
  reading: 'R',
  writing: 'W',
  speaking: 'S',
};

export function SkillProfileCard({ sessions }: { sessions: ExamSession[] }) {
  const { t } = useTranslation('exam');

  const profile = useMemo(() => buildSkillProfile(sessions), [sessions]);
  const overall = useMemo(() => overallEstimate(profile), [profile]);

  // Nothing measured at all — the empty state on the page already covers this.
  if (overall.value == null) return null;

  const missingNames = overall.missing.map((k) => t(k)).join(t('skillListSeparator'));

  return (
    <section
      className={`relative overflow-hidden bg-card border border-border rounded-[9px] shadow-sm`}
    >
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary to-primary" />

      <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 border-b border-border">
        <div className="w-9 h-9 rounded-[10px] bg-primary/[0.14] flex items-center justify-center shrink-0">
          <Layers className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-[15px] font-bold text-foreground tracking-tight leading-tight">
            {t('skillProfileTitle')}
          </h2>
          <p className="text-[11.5px] text-caption">{t('skillProfileSubtitle')}</p>
        </div>
      </div>

      {/* Headline estimate — a ceiling while any skill is unmeasured */}
      <div className="px-4 sm:px-5 py-4 border-b border-border">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-caption">
          {t('estimatedOverall')}
        </p>
        <div className="flex items-baseline gap-1.5 mt-1">
          {overall.bound === 'upper' && (
            <span className="text-[20px] font-bold text-caption leading-none">≤</span>
          )}
          <span className="text-[30px] font-extrabold text-foreground tabular-nums leading-none">
            {overall.value}
          </span>
          <span className="text-[12px] font-semibold text-muted-foreground">{t('clbUnit')}</span>
        </div>
        <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-2">
          {overall.bound === 'exact'
            ? t('estimateExactHint', { count: overall.skillsCovered })
            : t('estimateUpperHint', { skills: missingNames })}
        </p>
      </div>

      {/* Per-skill rows */}
      <div className="divide-y divide-border">
        {SKILL_KEYS.map((skill) => {
          const e = profile[skill];
          const tone = SKILL_TONE[skill];
          return (
            <div key={skill} className="flex items-center gap-3 px-4 sm:px-5 py-3">
              <span
                className={`w-5 h-5 rounded-[6px] ${tone.chip} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}
              >
                {SKILL_LETTER[skill]}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-foreground leading-tight">
                  {t(skill)}
                </p>
                {/* Coverage — how much of the section has ever been attempted */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="flex items-center gap-[2px]" aria-hidden>
                    {Array.from({ length: e.partsTotal }, (_, i) => (
                      <span
                        key={i}
                        className={`h-[3px] w-2.5 rounded-full ${
                          i < e.partsDone ? tone.bar : 'bg-muted'
                        }`}
                      />
                    ))}
                  </span>
                  <span className="text-[10.5px] text-caption tabular-nums">
                    {t('coverageParts', { done: e.partsDone, total: e.partsTotal })}
                  </span>
                </div>
              </div>

              {e.estimate != null ? (
                <span className={`text-[16px] font-extrabold tabular-nums ${tone.text} shrink-0`}>
                  {e.estimate}
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-caption shrink-0">
                  {t('skillNotAttempted')}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="flex items-start gap-1.5 px-4 sm:px-5 py-3 text-[11px] text-caption leading-relaxed border-t border-border">
        <Info className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
        {t('skillProfileFootnote')}
      </p>
    </section>
  );
}
