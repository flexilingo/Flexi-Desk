interface DifficultyBadgeProps {
  cefrLevel?: string;
}

export function DifficultyBadge({ cefrLevel }: DifficultyBadgeProps) {
  if (!cefrLevel) return null;

  const level = cefrLevel.toUpperCase();
  const isEasy = level.startsWith('A');
  const isMedium = level.startsWith('B');

  const label = isEasy ? 'Easy' : isMedium ? 'Medium' : 'Hard';
  const dotColor = isEasy ? 'bg-success' : isMedium ? 'bg-accent' : 'bg-destructive';

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 border border-border text-xs">
      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
