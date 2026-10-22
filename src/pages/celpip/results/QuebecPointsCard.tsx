import { useTranslation } from 'react-i18next';
import { SECTION_META } from './shared';

/**
 * The Québec immigration points a TCF Québec sitting is worth, shown BESIDE the
 * CEFR level and never instead of it. Not a language scale: one province's points
 * barème applied to the level each skill reached, so the card names its source
 * and date and says plainly that the points start at B2.
 */
export interface QuebecPointsRow {
  skill: 'listening' | 'reading' | 'writing' | 'speaking';
  label: string;
  /** CEFR level as written ("B2"), or null when the skill was not sat. */
  level: string | null;
  points: number | null;
}

export function QuebecPointsCard({
  rows,
  total,
  max,
  source,
}: {
  rows: QuebecPointsRow[];
  total: number;
  max: number;
  source: string;
}) {
  const { t } = useTranslation('exam');

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[13.5px] font-bold text-foreground">{t('tcfQuebec.pointsTitle')}</h3>
        <span className="text-[12px] font-bold tabular-nums text-primary">
          {t('tcfQuebec.pointsTotal', { total, max })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {rows.map((row) => (
          <div
            key={row.skill}
            className="flex flex-col gap-0.5 rounded-[9px] border border-border bg-muted/40 px-3 py-2.5"
          >
            <span className={`text-[11px] font-bold ${SECTION_META[row.skill].color}`}>
              {row.label}
            </span>
            <span className="text-[16px] font-extrabold leading-tight tabular-nums text-foreground">
              {row.level ?? '–'}
            </span>
            <span className="text-[11.5px] font-semibold tabular-nums text-muted-foreground">
              {row.points == null ? '–' : t('tcfQuebec.pointsValue', { points: row.points })}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        {t('tcfQuebec.pointsFloor')}
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{source}</p>
    </div>
  );
}
