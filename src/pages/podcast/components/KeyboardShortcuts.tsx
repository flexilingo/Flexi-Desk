import { useEffect, useRef } from 'react';
import { isTypingTarget, transportAction, type TransportAction } from '../utils/transport';

interface KeyboardShortcutsProps {
  onToggleSubtitles?: () => void;
  onAnalyze?: () => void;
  onTranslate?: () => void;
  onGrammar?: () => void;
  onSync?: () => void;
  /** F: a video's full screen (a podcast has nothing to fill the screen with). */
  onFullscreen?: () => void;
  onHelp?: () => void;
  onExit?: () => void;
  enabled?: boolean;
  /** Space/K, left/right line, J/L, M, up/down, B, P. Pages that pass none keep the letter keys only. */
  transport?: Partial<Record<TransportAction, () => void>>;
  /** Up/down change the volume (off where the arrows scroll something). */
  volumeKeys?: boolean;
}

export function KeyboardShortcuts({
  onToggleSubtitles,
  onAnalyze,
  onTranslate,
  onGrammar,
  onSync,
  onFullscreen,
  onHelp,
  onExit,
  enabled = true,
  transport,
  volumeKeys = true,
}: KeyboardShortcutsProps) {
  const transportRef = useRef(transport);
  useEffect(() => {
    transportRef.current = transport;
  });

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // Ctrl/Cmd/Alt combos belong to the OS (Cmd+C must copy, not toggle subtitles).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // A dialog or sheet on top owns the keys (its own Escape closes it).
      if (document.querySelector('[role="dialog"]')) return;

      const handlers = transportRef.current;
      if (handlers) {
        const action = transportAction(e, { volumeKeys });
        const run = action ? handlers[action] : undefined;
        if (action && run) {
          e.preventDefault();
          run();
          return;
        }
      }

      switch (e.key.toLowerCase()) {
        case 'c':
          onToggleSubtitles?.();
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
          onFullscreen?.();
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
    onAnalyze,
    onTranslate,
    onGrammar,
    onSync,
    onFullscreen,
    onHelp,
    onExit,
    volumeKeys,
  ]);

  return null;
}
