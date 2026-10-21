import { useEffect } from 'react';

interface Options {
  enabled?: boolean;
  /** Space / Enter reveals the answer. */
  onFlip?: () => void;
  /** Keys 1-5 submit a self-rating (only wired once the answer is shown). */
  onRate?: (rating: 1 | 2 | 3 | 4 | 5) => void;
}

/**
 * Keyboard shortcuts for the flashcard-style activities: Space/Enter to flip,
 * 1-5 to rate. Ignored while the user is typing into an input or textarea.
 */
export function useKeyboardShortcuts({ enabled = true, onFlip, onRate }: Options) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      if ((e.key === ' ' || e.key === 'Enter') && onFlip) {
        e.preventDefault();
        onFlip();
        return;
      }

      if (onRate && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        onRate(Number(e.key) as 1 | 2 | 3 | 4 | 5);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onFlip, onRate]);
}
