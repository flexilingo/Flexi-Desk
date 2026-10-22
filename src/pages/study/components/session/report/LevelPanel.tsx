import { useTranslation } from 'react-i18next';
import type { SessionInsights } from '../../../types';
import { levelBars } from '../../../lib/studyReport';
import { ReportPanel } from './ReportPanel';

/** Literal classes so Tailwind's content scanner emits them. */
const LEVEL_BAR: Record<string, string> = {
  A1: 'bg-cefr-a1',
  A2: 'bg-cefr-a2',
  B1: 'bg-cefr-b1',
  B2: 'bg-cefr-b2',
  C1: 'bg-cefr-c1',
  C2: 'bg-cefr-c2',
};

/**
 * The session's words by CEFR level, with the misses drawn inside the bar: not just how
 * much was missed, but WHERE on the difficulty curve — which tells the learner whether to
 * push up a level or consolidate. Only the words that carry a level count, and the panel
 * says so out loud.
 */
export function LevelPanel({ byLevel }: { byLevel: SessionInsights['by_level'] }) {
  const { t } = useTranslation('study');
  const bars = levelBars(byLevel);
  if (!bars) return null;
  return (
    <ReportPanel
      title={t('report.levelsTitle')}
      note={t('report.levelsNote')}
      testId="report-levels"
    >
      <div className="flex flex-col gap-2">
        {bars.map((l) => (
          <div key={l.level} className="flex items-center gap-2.5">
            <span className="w-7 shrink-0 text-[11px] font-black tabular-nums text-muted-foreground">
              {l.level}
            </span>
            <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`relative h-full rounded-full ${LEVEL_BAR[l.level] ?? 'bg-primary/70'}`}
                style={{ width: `${l.width}%` }}
              >
                {/* Misses as a darker cut inside the level's own bar: "of these, this many slipped" in one shape. */}
                {l.missed > 0 && (
                  <div
                    className="absolute inset-y-0 end-0 bg-foreground/25"
                    style={{ width: `${l.missedPct}%` }}
                  />
                )}
              </div>
            </div>
            <span className="w-20 shrink-0 text-end text-[11px] tabular-nums text-caption">
              <span className="font-bold text-foreground">{l.seen}</span>
              {l.missed > 0 && (
                <span className="ms-1">
                  ({l.missed} {t('report.missed')})
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </ReportPanel>
  );
}
