import { useEffect } from 'react';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { useVideoSurface } from './YouTubeMedia';

/**
 * Transport keys for the video player: Space/K play-pause, ←/→ 5 s, J/L 10 s, M mute. They live on
 * `window`, so they only work while focus is on our page — VideoHost hands focus back after a click
 * on the picture, which is what keeps them alive. Space before the first play does nothing: only
 * YouTube's own button starts a video (that is what counts as a view).
 */
export function useVideoKeys(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable)
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const store = usePlayerStore.getState();
      const started = useVideoSurface.getState().started;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (started) store.togglePlayPause();
          break;
        case 'arrowleft':
          e.preventDefault();
          if (started) store.skipBack(5);
          break;
        case 'arrowright':
          e.preventDefault();
          if (started) store.skipForward(5);
          break;
        case 'j':
          if (started) store.skipBack(10);
          break;
        case 'l':
          if (started) store.skipForward(10);
          break;
        case 'm':
          store.setVolume(store.volume > 0 ? 0 : 1);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
