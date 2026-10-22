import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { CefrLevel } from '../services/libraryService';
import type { FitShare } from './series-fit';

// A share of a whole: one hue, lightness steps (never a colour per level). Literal classes.
const RAMP: Record<CefrLevel, string> = {
  A1: 'bg-primary/20',
  A2: 'bg-primary/30',
  B1: 'bg-primary/45',
  B2: 'bg-primary/60',
  C1: 'bg-primary/80',
  C2: 'bg-primary',
};

const LEVEL_TILE: Record<CefrLevel, string> = {
  A1: 'bg-cefr-a1',
  A2: 'bg-cefr-a2',
  B1: 'bg-cefr-b1',
  B2: 'bg-cefr-b2',
  C1: 'bg-cefr-c1',
  C2: 'bg-cefr-c2',
};

const LABEL_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

/**
 * "Is this right for you?" for the library — the website's `LevelFitCard`, the same card the
 * podcast pages show: the level tile, a single-hue bar of how the episodes split across
 * levels, and a few plain lines, each already translated by the page (the bold part of a
 * line is the translation's `<b>`, drawn as `font-semibold text-foreground`).
 */
export function LibraryFitCard({
  title,
  level,
  levelName,
  levelHint,
  shares,
  points,
  compact = false,
}: {
  title: string;
  level: CefrLevel | null;
  levelName?: string;
  levelHint?: string;
  shares: FitShare[] | null;
  points: ReactNode[];
  /** Beside a header that already shows the level: no level tile, the hint as one line under the title. */
  compact?: boolean;
}) {
  const { i18n } = useTranslation('readingLibrary');
  const total = shares?.reduce((sum, s) => sum + s.value, 0) ?? 0;
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent' });

  return (
    <section
      className={cn(
        'rounded-[9px] border border-border bg-card shadow-xs',
        compact ? 'p-4' : 'p-5',
      )}
    >
      <h2 className={cn('font-bold text-foreground', compact ? 'text-[14px]' : 'text-[15px]')}>
        {title}
      </h2>
      {compact && levelHint && (
        <p className="mt-0.5 text-[12px] text-muted-foreground">{levelHint}</p>
      )}

      {level && !compact && (
        <div className="mt-3 flex items-center gap-3">
          <span
            className={cn(
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] text-[16px] font-extrabold text-white',
              LEVEL_TILE[level],
            )}
          >
            {level}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-foreground">
              {level}
              {levelName ? ` · ${levelName}` : ''}
            </p>
            {levelHint && <p className="text-[12.5px] text-muted-foreground">{levelHint}</p>}
          </div>
        </div>
      )}

      {shares && total > 0 && (
        <div className={compact ? 'mt-3' : 'mt-4'}>
          <div data-testid="fit-bar" className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {shares.map((s) => (
              <div
                key={s.level}
                className={RAMP[s.level]}
                style={{ width: `${(s.value / total) * 100}%` }}
              />
            ))}
          </div>
          <div
            className={cn(
              'mt-2 grid text-[11px] tabular-nums text-caption',
              LABEL_COLS[shares.length] ?? 'grid-cols-6',
            )}
          >
            {shares.map((s) => (
              <span key={s.level}>
                <span className="font-semibold text-muted-foreground">{s.level}</span>{' '}
                {percent.format(Math.round((s.value / total) * 100) / 100)}
              </span>
            ))}
          </div>
        </div>
      )}

      {points.length > 0 && (
        <ul
          className={cn(
            'text-muted-foreground',
            compact ? 'mt-3 space-y-1.5 text-[12.5px]' : 'mt-4 space-y-2.5 text-[13px]',
          )}
        >
          {points.map((point, i) => (
            <li key={i} className="flex gap-2.5">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
