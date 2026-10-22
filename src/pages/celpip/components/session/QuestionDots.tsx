interface QuestionDotsProps {
  total: number;
  current: number;
  answered: Set<number>;
  onJump?: (index: number) => void;
  /** Listening: the real exam never lets you go back to an earlier question. */
  forwardOnly?: boolean;
}

export function QuestionDots({ total, current, answered, onJump, forwardOnly }: QuestionDotsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 py-3">
      {Array.from({ length: total }, (_, i) => {
        const canJump = !forwardOnly && onJump;
        return (
          <button
            key={i}
            onClick={() => canJump && onJump(i)}
            disabled={!canJump}
            className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
              i === current
                ? 'bg-accent text-accent-foreground'
                : answered.has(i)
                  ? 'bg-accent/30 text-accent'
                  : 'bg-muted text-muted-foreground'
            } ${canJump ? 'cursor-pointer hover:bg-muted/80' : 'cursor-default'}`}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
