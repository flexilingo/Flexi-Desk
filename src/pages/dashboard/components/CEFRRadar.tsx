import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import type { CEFRSkillScore } from '../types';

interface Props {
  data: CEFRSkillScore[];
}

export function CEFRRadar({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">CEFR Progress</h3>
        <p className="text-center text-xs text-muted-foreground py-8">No data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">CEFR Progress</h3>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="skill" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
          <Radar
            name="Proficiency"
            dataKey="score"
            stroke="#8BB7A3"
            fill="#8BB7A3"
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {data.map((d) => (
          <span key={d.skill} className="text-xs text-muted-foreground">
            {d.skill}: <strong className="text-foreground">{d.cefrLevel}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
