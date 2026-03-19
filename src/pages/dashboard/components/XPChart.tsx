import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DailyXP } from '../types';

const MODULE_COLORS: Record<string, string> = {
  srs: '#8BB7A3',
  reading: '#6B9E8A',
  writing: '#4D8672',
  tutor: '#C58C6E',
  caption: '#B07A5E',
  pronunciation: '#9B694F',
  exam: '#8BB7A3',
  podcast: '#A3C4B3',
};

interface Props {
  data: DailyXP[];
}

export function XPChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">Daily XP (30 days)</h3>
        <p className="text-center text-xs text-muted-foreground py-8">No data yet</p>
      </div>
    );
  }

  // Transform: each date gets { date, srs, reading, ... }
  const modules = new Set<string>();
  data.forEach((d) => d.breakdown.forEach((b) => modules.add(b.module)));

  const chartData = data.map((d) => {
    const entry: Record<string, string | number> = { date: d.date.slice(5) }; // MM-DD
    d.breakdown.forEach((b) => {
      entry[b.module] = b.xp;
    });
    return entry;
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Daily XP (30 days)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          {Array.from(modules).map((mod) => (
            <Bar
              key={mod}
              dataKey={mod}
              stackId="xp"
              fill={MODULE_COLORS[mod] ?? '#8BB7A3'}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
