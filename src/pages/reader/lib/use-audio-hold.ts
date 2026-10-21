import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';

/**
 * Hold the player while something is being read, and let it go afterwards.
 *
 * A reader listening to a recording taps a word they did not catch. The recording
 * carries on talking underneath the definition, so they miss the next sentence as
 * well — and the only way out is to find the pause button, read, then find play
 * again. The recording should simply wait.
 *
 * The play state is remembered at the moment the first overlay opens, playback is
 * paused, and it resumes only when the LAST one closes — and only if it was
 * playing to begin with. A reader who had paused on purpose does not want the
 * dialog to start their audio for them.
 *
 * DESK: the player is the podcast `playerStore` (the same one the mini player
 * drives). Phase F wires this to the book's recordings; until then nothing calls it.
 */
export function useAudioHold(held: boolean) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);

  // Mirrored into a ref so the hold effect can read the CURRENT play state
  // without re-running every time it changes — it must run on `held` alone, or
  // pausing would immediately look like a change worth reacting to.
  const playingRef = useRef(false);
  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  const wasPlayingRef = useRef(false);
  const wasHeldRef = useRef(false);

  useEffect(() => {
    if (held && !wasHeldRef.current) {
      wasPlayingRef.current = playingRef.current;
      pause();
    } else if (!held && wasHeldRef.current) {
      if (wasPlayingRef.current) resume();
      wasPlayingRef.current = false;
    }
    wasHeldRef.current = held;
  }, [held, pause, resume]);
}
