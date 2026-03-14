import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  onToggleSubtitles?: () => void;
  onNote?: () => void;
  onAnalyze?: () => void;
  onTranslate?: () => void;
  onGrammar?: () => void;
  onSync?: () => void;
  onFocus?: () => void;
  onHelp?: () => void;
  onExit?: () => void;
  enabled?: boolean;
}

export function KeyboardShortcuts({
  onToggleSubtitles,
  onNote,
  onAnalyze,
  onTranslate,
  onGrammar,
  onSync,
  onFocus,
  onHelp,
  onExit,
  enabled = true,
}: KeyboardShortcutsProps) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key.toLowerCase()) {
        case 'c':
          onToggleSubtitles?.();
          break;
        case 'n':
          onNote?.();
          break;
        case 'a':
          onAnalyze?.();
          break;
        case 't':
          onTranslate?.();
          break;
        case 'g':
          onGrammar?.();
          break;
        case 's':
          onSync?.();
          break;
        case 'f':
          onFocus?.();
          break;
        case 'h':
          onHelp?.();
          break;
        case 'escape':
          onExit?.();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    enabled,
    onToggleSubtitles,
    onNote,
    onAnalyze,
    onTranslate,
    onGrammar,
    onSync,
    onFocus,
    onHelp,
    onExit,
  ]);

  return null;
}
