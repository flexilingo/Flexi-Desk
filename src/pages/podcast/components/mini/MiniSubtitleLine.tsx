import { cleanWord } from '../../utils/words';
import { cn } from '@/lib/utils';

/**
 * The line being spoken, above the mini player bar when CC is on (website: `MiniSubtitleLine`).
 * Each word opens the word dialog; the full reading experience lives in the full player.
 */
export function MiniSubtitleLine({
  text,
  onWordClick,
}: {
  text: string;
  onWordClick: (word: string) => void;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div className="relative border-t border-border bg-card/95 backdrop-blur">
      <div className="overflow-x-auto px-5 py-2">
        <p dir="auto" className="text-center text-base leading-relaxed text-foreground">
          {words.map((w, i) => (
            <span key={`${i}-${w}`}>
              <button
                type="button"
                onClick={() => cleanWord(w).length > 1 && onWordClick(w)}
                className={cn(
                  'inline cursor-pointer rounded-[4px] px-0.5 transition-colors',
                  'decoration-terra-400 underline-offset-2 hover:text-accent hover:underline',
                )}
              >
                {w}
              </button>
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
