import { useCallback, useEffect } from 'react';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';

/** The bar's own skip buttons move five seconds, and so does the full player's arrow key. */
const SKIP_SECONDS = 5;
/** YouTube's step, and the full player's. */
const VOLUME_STEP = 0.05;

/**
 * The keyboard for the player bar while a book is open: Space plays and
 * pauses, ← → move five seconds, ↑ ↓ turn the volume up and down.
 *
 * The bar has no keys of its own — on every other page Space and the arrows
 * belong to the page, and only the full-screen player takes them. Someone
 * listening along with a textbook has their eyes on the page and their hands
 * on the keyboard, so here the keys go to the recording. Only while the bar is
 * holding one, though: with nothing loaded they scroll the book as before.
 *
 * `enabled` is off while something else has the floor — a word's dialog, a
 * video, a word being said (see `useAudioHold`). Space there would start the
 * recording again underneath the very thing it was paused for.
 */
export function usePlayerKeys(enabled: boolean) {
  // DESK: the podcast `playerStore` stands in for the website's global audio.
  const episode = usePlayerStore((s) => s.currentEpisode);
  const volume = usePlayerStore((s) => s.volume);
  const togglePlay = usePlayerStore((s) => s.togglePlayPause);
  const skipBack = usePlayerStore((s) => s.skipBack);
  const skipForward = usePlayerStore((s) => s.skipForward);
  const skip = useCallback(
    (seconds: number) => (seconds < 0 ? skipBack(-seconds) : skipForward(seconds)),
    [skipBack, skipForward],
  );
  const setVolume = usePlayerStore((s) => s.setVolume);
  const active = enabled && Boolean(episode);

  useEffect(() => {
    if (!active) return;
    let spaceTaken = false;

    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd/Alt combos belong to the browser, and a key something else
      // already handled (a focused slider, the editor bar) is not ours.
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      // Typing, a native video's own controls, and anything inside a dialog.
      if (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO'].includes(target.tagName) ||
        target.closest('[role="dialog"]')
      ) {
        return;
      }

      switch (event.key) {
        case ' ':
          event.preventDefault();
          // Holding Space down would otherwise flicker between play and pause.
          if (event.repeat) return;
          spaceTaken = true;
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          event.preventDefault();
          skip(event.key === 'ArrowLeft' ? -SKIP_SECONDS : SKIP_SECONDS);
          break;
        case 'ArrowUp':
        case 'ArrowDown': {
          event.preventDefault();
          // Clamped: the audio element throws on a volume outside 0–1.
          const next = volume + (event.key === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP);
          setVolume(Math.round(Math.max(0, Math.min(1, next)) * 100) / 100);
          break;
        }
      }
    };

    // A focused button clicks itself on Space's keyup. Right after pressing the
    // play button with the mouse, that would pause and resume in one keystroke.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !spaceTaken) return;
      spaceTaken = false;
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [active, volume, togglePlay, skip, setVolume]);
}
