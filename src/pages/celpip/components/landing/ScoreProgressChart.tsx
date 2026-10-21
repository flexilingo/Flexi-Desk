import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon } from 'lucide-react';
import type { ExamSession, SectionType } from '../../types';

// Recharts draws SVG, so its series colours must be plain strings — the same
// raw-hex exception the desk XPChart already relies on (Tailwind tokens can't
// reach an SVG `stroke`). These four mirror the brand identity: sage / accent
// terracotta / deep green / deep terracotta. Two of the tokens (accent and
// warning) collapse to the same hex, so speaking uses a deeper terracotta to
// stay distinguishable — and identity never rests on colour alone anyway
// (legend chips + end-of-line letters carry it).
const SERIES: { key: SectionType; letter: string; color: string; chip: string; text: string }[] = [
  { key: 'listening', letter: 'L', color: '#8BB7A3', chip: 'bg-success', text: 'text-success' },
  { key: 'reading', letter: 'R', color: '#C58C6E', chip: 'bg-accent', text: 'text-accent' },
  { key: 'writing', letter: 'W', color: '#4D8672', chip: 'bg-primary', text: 'text-primary' },
  { key: 'speaking', letter: 'S', color: '#B07A5E', chip: 'bg-warning', text: 'text-warning' },
];

const GRID_COLOR = '#e5e2d9'; // border token
const TICK_COLOR = '#6b705c'; // muted-foreground token

interface ChartPoint {
  attempt: number;
  date: string;
  listening: number | null;
  reading: number | null;
  writing: number | null;
  speaking: number | null;
}

interface ScoreProgressChartProps {
  /** Ranked sessions, newest first (as the sessions query returns them). */
  sessions: ExamSession[];
  className?: string;
}

export function ScoreProgressChart({ sessions, className = '' }: ScoreProgressChartProps) {
  const { t, i18n } = useTranslation('celpip');

  const data: ChartPoint[] = useMemo(
    () =>
      sessions
        .slice()
        .reverse() // chronological for the time axis
        .map((s, i) => ({
          attempt: i + 1,
          date: s.created_at,
          listening: s.listening_score ?? null,
          reading: s.reading_score ?? null,
          writing: s.writing_score ?? null,
          speaking: s.speaking_score ?? null,
        })),
    [sessions],
  );

  // Per-section change between the first and latest scored attempt.
  const deltas = useMemo(
    () =>
      SERIES.map(({ key, letter, text, chip }) => {
        const values = data.map((p) => p[key]).filter((v): v is number => v != null);
        const delta = values.length >= 2 ? values[values.length - 1] - values[0] : null;
        return { key, letter, text, chip, delta };
      }),
    [data],
  );

  const scoredPoints = data.filter((p) => SERIES.some(({ key }) => p[key] != null));

  if (scoredPoints.length < 2) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 px-4 py-10 text-center ${className}`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary/10">
          <LineChartIcon className="h-4.5 w-4.5 text-primary" />
        </div>
        <p className="max-w-[240px] text-[12px] leading-relaxed text-muted-foreground">
          {t('progressEmptyHint')}
        </p>
      </div>
    );
  }

  const lastIndex = data.length - 1;

  return (
    <div className={className}>
      {/* A time axis reads left-to-right even in RTL locales. */}
      <div dir="ltr" className="w-full">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 12, right: 22, left: -26, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 4" stroke={GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="attempt"
              tick={{ fontSize: 10, fill: TICK_COLOR }}
              tickLine={false}
              axisLine={{ stroke: GRID_COLOR }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 12]}
              ticks={[0, 3, 6, 9, 12]}
              tick={{ fontSize: 10, fill: TICK_COLOR }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: GRID_COLOR, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as ChartPoint;
                return (
                  <div className="min-w-[140px] rounded-[9px] border border-border bg-card px-3 py-2.5 shadow-md">
                    <p className="text-[11px] font-bold tabular-nums text-foreground">
                      {t('attemptLabel', { n: point.attempt })}
                      <span className="font-semibold text-muted-foreground">
                        {' · '}
                        {new Date(point.date).toLocaleDateString(i18n.language, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </p>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {SERIES.map(({ key, chip, text }) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${chip}`} />
                          <span className="flex-1 text-[11px] text-muted-foreground">{t(key)}</span>
                          <span className={`text-[11px] font-bold tabular-nums ${text}`}>
                            {point[key] ?? '–'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
            {SERIES.map(({ key, letter, color }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                connectNulls
                dot={{ r: 2, fill: color, strokeWidth: 0 }}
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: '#fffef7' }}
                isAnimationActive={false}
                // recharts v3's Line `label` prop isn't narrowly typed, so the
                // render-prop param stays `any`; we only read x / y / index.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                label={(props: any) =>
                  props.index === lastIndex && props.x != null && props.y != null ? (
                    <text
                      key={`${key}-end`}
                      x={props.x + 8}
                      y={props.y + 3.5}
                      fontSize={10}
                      fontWeight={700}
                      fill={color}
                    >
                      {letter}
                    </text>
                  ) : (
                    // recharts expects an SVG element back — empty group when hidden.
                    <g key={`${key}-${props.index}`} />
                  )
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
        {SERIES.map(({ key, chip, text }) => (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            <span className={`h-2 w-2 rounded-full ${chip}`} />
            <span className={text}>{t(key)}</span>
          </span>
        ))}
      </div>

      {/* Change since first attempt */}
      <div className="mt-3 border-t border-border pt-3">
        <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {t('changeSinceFirst')}
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {deltas.map(({ key, letter, text, chip, delta }) => {
            const DeltaIcon =
              delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
            const deltaTone =
              delta == null || delta === 0
                ? 'text-muted-foreground'
                : delta > 0
                  ? 'text-success'
                  : 'text-error';
            return (
              <div
                key={key}
                className="flex flex-col items-center gap-1 rounded-[9px] border border-border bg-card px-1.5 py-2"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-[6px] ${chip} text-[10px] font-bold text-white`}
                >
                  {letter}
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 text-[11.5px] font-bold tabular-nums ${deltaTone}`}
                >
                  <DeltaIcon className="h-3 w-3" />
                  {delta == null ? '–' : delta > 0 ? `+${delta}` : delta}
                </span>
                <span className={`sr-only text-[9px] font-semibold ${text}`}>{t(key)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
