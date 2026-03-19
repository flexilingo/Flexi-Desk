import { useMemo } from 'react';
import type { StreakDay } from '../types';

interface Props {
  data: StreakDay[];
}

function intensityClass(count: number): string {
  if (count === 0) return 'fill-muted';
  if (count <= 2) return 'fill-primary/20';
  if (count <= 5) return 'fill-primary/40';
  if (count <= 9) return 'fill-primary/60';
  return 'fill-primary';
}

const DAY_LABELS = ['M', '', 'W', '', 'F', '', ''];
const CELL_SIZE = 12;
const GAP = 3;

export function StreakCalendar({ data }: Props) {
  const weeks = useMemo(() => {
    if (data.length === 0) return [];
    // Pad start so first day aligns to correct weekday
    const firstDate = new Date(data[0]?.date ?? '');
    const startDow = (firstDate.getDay() + 6) % 7; // 0=Mon
    const padded: (StreakDay | null)[] = Array(startDow).fill(null);
    padded.push(...data);
    // Group into weeks
    const result: (StreakDay | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      result.push(padded.slice(i, i + 7));
    }
    return result;
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">Activity</h3>
        <p className="text-center text-xs text-muted-foreground py-4">No data yet</p>
      </div>
    );
  }

  const svgWidth = weeks.length * (CELL_SIZE + GAP) + 30;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Activity</h3>
      <div className="overflow-x-auto">
        <svg width={svgWidth} height={7 * (CELL_SIZE + GAP) + 10} className="block">
          {/* Day labels */}
          {DAY_LABELS.map((label, i) =>
            label ? (
              <text
                key={i}
                x={0}
                y={i * (CELL_SIZE + GAP) + CELL_SIZE}
                className="fill-muted-foreground"
                fontSize={9}
              >
                {label}
              </text>
            ) : null,
          )}
          {/* Cells */}
          {weeks.map((week, wi) =>
            week.map((day, di) =>
              day ? (
                <rect
                  key={`${wi}-${di}`}
                  x={wi * (CELL_SIZE + GAP) + 20}
                  y={di * (CELL_SIZE + GAP)}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={2}
                  className={intensityClass(day.activityCount)}
                >
                  <title>
                    {day.date}: {day.xpEarned} XP, {day.activityCount} activities
                  </title>
                </rect>
              ) : null,
            ),
          )}
        </svg>
      </div>
    </div>
  );
}
