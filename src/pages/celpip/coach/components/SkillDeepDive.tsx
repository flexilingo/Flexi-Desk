/**
 * One skill's full diagnosis: where they are, what is wrong, why, and the
 * recurring patterns behind it.
 *
 * The panel is the single permitted card. Everything inside — the accuracy
 * table, each error pattern, the clinic — is a divided section, not another
 * bordered box.
 */

import { useTranslation } from 'react-i18next';
import type { CoachSkill, CoachSkillReport } from '../coachTypes';
import { ErrorPatternCard } from './ErrorPatternCard';
import { RewriteClinic } from './RewriteClinic';
import { PANEL, SKILL_TONE, accuracyBar, accuracyPct } from './shared';

export function SkillDeepDive({
  skill,
  data,
  examType,
}: {
  skill: CoachSkill;
  data: CoachSkillReport;
  examType: string;
}) {
  const { t } = useTranslation('exam');
  const tone = SKILL_TONE[skill];
  const Icon = tone.icon;
  const trend = data.clb_trend ?? [];
  const delta = trend.length > 1 ? trend[trend.length - 1] - trend[0] : null;

  return (
    <section className={`${PANEL} overflow-hidden`}>
      <div className={`h-[3px] ${tone.stripe}`} />

      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-7 h-7 rounded-[7px] ${tone.bg} ${tone.text} flex items-center justify-center shrink-0`}
          >
            <Icon className="w-3.5 h-3.5" />
          </span>
          <h2 className="text-[13px] font-bold text-foreground truncate">{t(skill)}</h2>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
          {data.clb_now != null && (
            <span className={`text-[13px] font-bold ${tone.text}`}>CLB {data.clb_now}</span>
          )}
          {delta != null && delta !== 0 && (
            <span
              className={`text-[11px] font-semibold ${delta > 0 ? 'text-success' : 'text-error'}`}
            >
              {delta > 0 ? '+' : ''}
              {Math.round(delta * 10) / 10}
            </span>
          )}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {data.diagnosis && (
          <p className="text-[13px] text-foreground leading-relaxed">{data.diagnosis}</p>
        )}

        {(data.root_causes?.length ?? 0) > 0 && (
          <ul className="space-y-1.5">
            {data.root_causes!.map((rc, i) => (
              <li
                key={i}
                className="flex gap-2 text-[12.5px] text-muted-foreground leading-relaxed"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-[7px]" />
                <span>{rc.cause}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Single-hue lightness ramp, never one colour per part type. */}
        {(data.accuracy_by_part_type?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-caption">
              {t('coach.accuracyByPart')}
            </p>
            {data.accuracy_by_part_type!.map((row, i) => {
              const pct = accuracyPct(row.correct, row.total);
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[11.5px] text-muted-foreground w-36 shrink-0 truncate">
                    {row.part_type?.replace(/_/g, ' ')}
                  </span>
                  <span className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <span
                      className={`block h-full rounded-full ${accuracyBar(pct)}`}
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </span>
                  <span className="text-[11px] font-semibold text-foreground tabular-nums w-16 text-end shrink-0">
                    {row.correct}/{row.total}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {(data.criteria_profile?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-caption">
              {t('coach.criteriaProfile')}
            </p>
            {data.criteria_profile!.map((c, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span className="text-[11.5px] font-semibold text-foreground w-32 shrink-0 truncate">
                  {c.criterion?.replace(/_/g, ' ')}
                </span>
                <span className="text-[11.5px] font-bold text-primary tabular-nums shrink-0">
                  {c.avg}
                </span>
                <span className="text-[12px] text-muted-foreground leading-relaxed">
                  {c.verdict}
                </span>
              </div>
            ))}
          </div>
        )}

        {data.delivery && (data.delivery.wpm != null || data.delivery.note) && (
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            {data.delivery.wpm != null && (
              <span className="font-semibold text-foreground tabular-nums">
                {t('coach.wpm', { value: Math.round(data.delivery.wpm) })}
                {data.delivery.filler_rate != null
                  ? ` · ${t('coach.fillerRate', { value: Math.round(data.delivery.filler_rate * 100) })}`
                  : ''}
                {' — '}
              </span>
            )}
            {data.delivery.note}
          </p>
        )}

        {data.timing?.recommendation && (
          <p className="text-[12.5px] text-foreground leading-relaxed rounded-[7px] bg-muted px-3 py-2.5">
            <span className="font-bold">{t('coach.timing')}: </span>
            {data.timing.recommendation}
          </p>
        )}
      </div>

      {(data.error_patterns?.length ?? 0) > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {data.error_patterns!.map((p, i) => (
            <ErrorPatternCard key={p.pattern_id || i} pattern={p} examType={examType} />
          ))}
        </div>
      )}

      {(data.clinic?.length ?? 0) > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {data.clinic!.map((c, i) => (
            <RewriteClinic key={i} clinic={c} skill={skill} examType={examType} />
          ))}
        </div>
      )}

      {(data.phrase_bank?.length ?? 0) > 0 && (
        <div className="px-4 py-4 border-t border-border space-y-2.5">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-caption">
            {t('coach.phraseBank')}
          </p>
          {data.phrase_bank!.map((g, i) => (
            <div key={i}>
              <p className="text-[12px] font-semibold text-foreground">{g.function}</p>
              <div dir="ltr" className="text-left flex flex-wrap gap-1.5 mt-1">
                {(g.phrases ?? []).map((phrase, j) => (
                  <span
                    key={j}
                    className="px-2 py-0.5 rounded-[7px] bg-muted border border-border text-[11.5px] text-foreground"
                  >
                    {phrase}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
