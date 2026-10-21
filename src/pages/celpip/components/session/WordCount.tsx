interface WordCountProps {
  text: string;
  min: number;
  max: number;
}

// Empty string counts as 0 words — a bare `split` would report 1.
function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

export function WordCount({ text, min, max }: WordCountProps) {
  const count = countWords(text);
  const isBelow = count < min;
  const isOver = count > max;
  const isGood = !isBelow && !isOver;

  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-[6px] tabular-nums ${
        isGood
          ? 'bg-success/20 text-success'
          : isOver
            ? 'bg-error/15 text-error'
            : 'bg-muted text-muted-foreground'
      }`}
    >
      {count} / {min}–{max}
    </span>
  );
}
