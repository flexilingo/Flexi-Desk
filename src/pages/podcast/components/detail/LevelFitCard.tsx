import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { CefrLevel } from '../../types';
import { fitSpeedKey, showShares, topShare } from '../../utils/levelFit';

const RAMP: Record<CefrLevel, string> = {
  A1: 'bg-primary/20',
  A2: 'bg-primary/30',
  B1: 'bg-primary/45',
  B2: 'bg-primary/60',
  C1: 'bg-primary/80',
  C2: 'bg-primary',
};

interface Props {
  level: CefrLevel | null;
  bands: (CefrLevel | null | undefined)[];
  wordsPerMinute: number | null;
  readyCount: number;
}

/**
 * "Is this show right for you?": a single-hue bar of how its transcribed episodes split across levels
 * plus a few plain lines. Any line without data is left out; with nothing to say the card is absent.
 */
export function LevelFitCard({ level, bands, wordsPerMinute, readyCount }: Props) {
  const { t, i18n } = useTranslation('podcastUi');
  const shares = showShares(bands);
  const top = topShare(shares);
  const speedKey = fitSpeedKey(wordsPerMinute);
  if (!level && !top && !speedKey && readyCount === 0) return null;

  const total = shares?.reduce((s, x) => s + x.value, 0) ?? 0;
  const pct = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  const num = new Intl.NumberFormat(i18n.language);

  const points: string[] = [];
  if (top) points.push(t('fitMostly', { percent: num.format(top.percent), level: top.level }));
  if (speedKey && wordsPerMinute != null)
    points.push(t(speedKey, { wpm: num.format(Math.round(wordsPerMinute)) }));
  if (readyCount > 0) points.push(t('fitReady', { count: readyCount }));

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-foreground">{t('fitTitle')}</h2>
      {shares && total > 0 && (
        <div className="mt-3">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {shares.map((s) => (
              <div
                key={s.level}
                className={cn(RAMP[s.level])}
                style={{ width: `${(s.value / total) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
            {shares.map((s) => (
              <span key={s.level}>
                <span className="font-semibold text-foreground">{s.level}</span>{' '}
                {pct.format(Math.round((s.value / total) * 100) / 100)}
              </span>
            ))}
          </div>
        </div>
      )}
      {points.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[13px] text-muted-foreground">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
