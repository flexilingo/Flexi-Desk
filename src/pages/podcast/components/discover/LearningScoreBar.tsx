interface LearningScoreBarProps {
  score: number | null;
  showLabel?: boolean;
}

export function LearningScoreBar({ score, showLabel = false }: LearningScoreBarProps) {
  if (score == null) return null;
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 75 ? 'bg-success' : pct >= 50 ? 'bg-accent' : 'bg-gray-400';

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="text-xs text-muted-foreground">{score}/100</span>}
    </div>
  );
}
