interface ScoreRingProps {
  score: number;
  label: string;
  size?: number;
}

function getScoreClass(score: number): string {
  if (score <= 40) return 'stroke-destructive';
  if (score <= 70) return 'stroke-warning';
  return 'stroke-success';
}

export function ScoreRing({ score, label, size = 80 }: ScoreRingProps) {
  const radius = 32;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;
  const colorClass = getScoreClass(score);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center">
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            className="stroke-muted"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            className={colorClass}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: offset,
            }}
          />
        </svg>
        <span className="absolute text-sm font-bold text-foreground">{Math.round(score)}</span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
