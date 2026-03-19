import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { VocabGrowthPoint } from '../types';

interface Props {
  data: VocabGrowthPoint[];
}

export function VocabTimeline({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">Vocabulary Growth</h3>
        <p className="text-center text-xs text-muted-foreground py-8">No data yet</p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    words: d.cumulativeCount,
  }));

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Vocabulary Growth</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="words"
            stroke="#8BB7A3"
            fill="#8BB7A3"
            fillOpacity={0.2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
