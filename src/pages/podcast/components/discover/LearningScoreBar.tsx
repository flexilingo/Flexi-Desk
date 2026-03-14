interface LearningScoreBarProps {
  score: number;
}

export function LearningScoreBar({ score }: LearningScoreBarProps) {
  const pct = Math.max(0, Math.min(100, score));

  return (
    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
