import { useCallback, useEffect, useRef, useState } from 'react';
import { scaleOf, STUDY_TEXT_SIZES, useStudyReadPrefs, type StudyTextSizeId } from './viewPrefs';

/**
 * The session's reading view — text size + distraction-free (focus) mode.
 *
 * Text size is a per-computer reading comfort: the session root carries it as
 * `data-study-size` and the card text inside is set in em (see index.css).
 *
 * Focus mode makes the card the only thing on screen: the runner drops its tallies and
 * chrome and the control strip appears under the card. It takes the whole window
 * on its own and asks for native fullscreen as a bonus: if that is refused it simply
 * stays in the window, so the feature degrades to "everything extra hidden".
 * `F` toggles it; Esc leaves it.
 */
export function useStudyReadingView() {
  const { textSize, setTextSize } = useStudyReadPrefs();
  const [focusMode, setFocusModeState] = useState(false);
  // The side effect (fullscreen) must not live inside a state updater: StrictMode runs those twice.
  const focusRef = useRef(false);
  const setFocusMode = useCallback((next: boolean) => {
    focusRef.current = next;
    setFocusModeState(next);
  }, []);

  const toggleFocusMode = useCallback(() => {
    const next = !focusRef.current;
    setFocusMode(next);
    try {
      if (next) void document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    } catch {
      // Fullscreen refused: focus mode still holds the window.
    }
  }, [setFocusMode]);

  // Esc (or the system's own exit) leaves fullscreen without going through our button — follow it.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [setFocusMode]);

  // Leaving the session must not leave the window stuck in fullscreen.
  useEffect(
    () => () => {
      try {
        if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      } catch {
        // nothing to undo
      }
    },
    [],
  );

  // `f` toggles focus mode; Escape leaves it. Never hijacks typing (cloze / type / sentence cards have inputs).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFocusMode();
      } else if (e.key === 'Escape' && focusMode) {
        toggleFocusMode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFocusMode, focusMode]);

  return { textSize, setTextSize, scale: scaleOf(textSize), focusMode, toggleFocusMode };
}

export type { StudyTextSizeId };
export { STUDY_TEXT_SIZES };
