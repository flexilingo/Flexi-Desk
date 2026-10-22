const BAR_HEIGHTS = ['h-1.5', 'h-2.5', 'h-3.5', 'h-4', 'h-5'];

/** Five bars that rise with the microphone level (0..1) - the learner sees they are being heard. */
export default function MicLevelBars({ level, label }: { level: number; label: string }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      className="mb-2 flex h-5 items-end justify-center gap-1"
    >
      {BAR_HEIGHTS.map((height, i) => (
        <span
          key={height}
          className={`w-1.5 rounded-full transition-colors duration-150 ${height} ${
            level >= (i + 1) * 0.2 - 0.1 ? 'bg-primary-light' : 'bg-border'
          }`}
        />
      ))}
    </div>
  );
}
