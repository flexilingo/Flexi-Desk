import { useMemo } from 'react';
import type { StudyHeatmapEntry } from '../types';

interface Props {
  data: StudyHeatmapEntry[];
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];
const CELL_SIZE = 18;
const GAP = 2;

function intensityClass(minutes: number): string {
  if (minutes === 0) return 'fill-muted';
  if (minutes <= 5) return 'fill-primary/20';
  if (minutes <= 15) return 'fill-primary/40';
  if (minutes <= 30) return 'fill-primary/60';
  return 'fill-primary';
}

export function StudyHeatmap({ data }: Props) {
  const grid = useMemo(() => {
    // 7 days x 24 hours
    const map: Record<string, number> = {};
    data.forEach((d) => {
      map[`${d.dayOfWeek}-${d.hour}`] = d.minutes;
    });
    return map;
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">Study Times</h3>
        <p className="text-center text-xs text-muted-foreground py-8">No data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Study Times</h3>
      <div className="overflow-x-auto">
        <svg
          width={24 * (CELL_SIZE + GAP) + 40}
          height={7 * (CELL_SIZE + GAP) + 20}
          className="block"
        >
          {/* Hour labels */}
          {HOUR_LABELS.map((h) => (
            <text
              key={h}
              x={h * (CELL_SIZE + GAP) + 40 + CELL_SIZE / 2}
              y={7 * (CELL_SIZE + GAP) + 14}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={8}
            >
              {h}
            </text>
          ))}
          {/* Day labels + cells */}
          {DAY_LABELS.map((label, day) => (
            <g key={day}>
              <text
                x={0}
                y={day * (CELL_SIZE + GAP) + CELL_SIZE - 2}
                className="fill-muted-foreground"
                fontSize={9}
              >
                {label}
              </text>
              {Array.from({ length: 24 }, (_, hour) => {
                const mins = grid[`${day}-${hour}`] ?? 0;
                return (
                  <rect
                    key={hour}
                    x={hour * (CELL_SIZE + GAP) + 40}
                    y={day * (CELL_SIZE + GAP)}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    rx={3}
                    className={intensityClass(mins)}
                  >
                    <title>
                      {label} {hour}:00 — {mins} activities
                    </title>
                  </rect>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
