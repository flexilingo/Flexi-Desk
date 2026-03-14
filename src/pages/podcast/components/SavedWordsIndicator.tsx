interface SavedWordsIndicatorProps {
  count: number;
  onClick: () => void;
}

export function SavedWordsIndicator({ count, onClick }: SavedWordsIndicatorProps) {
  if (count <= 0) return null;

  return (
    <button
      onClick={onClick}
      className="absolute bottom-20 left-4 z-[100] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:scale-105 transition-transform"
    >
      🎯 {count} saved
    </button>
  );
}
