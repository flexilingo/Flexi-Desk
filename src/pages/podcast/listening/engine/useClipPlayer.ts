/**
 * Plays exactly [clip.start, clip.end] and stops. The only file in this feature
 * that touches the audio element.
 *
 * Why not useAudioProgress(): it is timeupdate-driven, ~250ms granularity. On a
 * 4-second decode clip a 250ms overrun plays the answer. Clip-end has to be
 * enforced by rAF polling audioRef.current.currentTime — ~16ms, zero re-renders.
 */

import { useEffect, useRef, useState } from 'react';
import type { ClipRange } from '../types';

/** Stop this many WALL-CLOCK seconds early. Kills overshoot inaudibly. */
const LOOKAHEAD_SEC = 0.05;
/** How long a buffering stall runs before we tell the user. */
const STALL_MS = 8000;

export interface ClipPlayerOptions {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /** AUDIO timeline. null = nothing to play (a no-audio step). */
  clip: ClipRange | null;
  rate: number;
  /** True only in phases 'arming' | 'playing'. */
  active: boolean;
  /**
   * Bump to force a fresh arm of the SAME clip (a repeat, or a user replay).
   * Without this the effect deps are unchanged and playback never restarts.
   */
  armToken: number;
  /**
   * Pick up from the live playhead instead of seeking to clip.start — used when
   * resuming after a word lookup. Ignored (and clip.start used) if the playhead
   * has drifted outside the clip.
   */
  armInPlace?: boolean;
  onArmed: () => void;
  onEnd: (info: { overshootMs: number }) => void;
  /** The user scrubbed outside the clip. */
  onExternalSeek: (to: number) => void;
  /** The user hit play/pause themselves. */
  onExternalPause: () => void;
  onStall: () => void;
}

export function useClipPlayer({
  audioRef,
  clip,
  rate,
  active,
  armToken,
  armInPlace = false,
  onArmed,
  onEnd,
  onExternalSeek,
  onExternalPause,
  onStall,
}: ClipPlayerOptions): void {
  // Callbacks live in a ref so the effect depends only on the values that
  // should actually re-arm playback. Refreshed after commit, never during
  // render — the initial value covers the first mount.
  const cb = useRef({ onArmed, onEnd, onExternalSeek, onExternalPause, onStall });
  useEffect(() => {
    cb.current = { onArmed, onEnd, onExternalSeek, onExternalPause, onStall };
  });

  const start = clip?.start ?? null;
  const end = clip?.end ?? null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !active || start === null || end === null || end <= start) return;

    // Ownership tokens: tell OUR seek/pause apart from the user grabbing the wheel.
    let engineSeek = false;
    let enginePause = false;
    let armed = false;
    let cancelled = false;
    let raf = 0;
    let stallTimer = 0;

    const stop = () => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(stallTimer);

      const overshoot = Math.max(0, audio.currentTime - end);
      enginePause = true;
      audio.pause();
      // Snap the residual back while paused — inaudible, and it keeps the next
      // continuous-mode window computation exact.
      if (overshoot > 0.02) {
        engineSeek = true;
        audio.currentTime = end;
      }
      cb.current.onEnd({ overshootMs: Math.round(overshoot * 1000) });
    };

    /**
     * Predictive and rate-aware: remaining WALL-CLOCK time, recomputed each
     * frame, so a mid-clip rate change needs no re-arm.
     */
    const reachedEnd = () => (end - audio.currentTime) / (audio.playbackRate || 1) <= LOOKAHEAD_SEC;

    const tick = () => {
      if (cancelled) return;
      if (!audio.paused && reachedEnd()) {
        stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    // rAF is frozen in a background tab; timeupdate is not. Worst-case
    // background overshoot is ~250ms, which nobody is listening to. This pair
    // is the whole trick.
    const onTimeUpdate = () => {
      if (!audio.paused && reachedEnd()) stop();
    };
    const onEnded = () => stop();

    const arm = () => {
      if (cancelled) return;
      audio.playbackRate = rate;
      // Comprehension drills must not chipmunk at 0.85x.
      audio.preservesPitch = true;
      (audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;

      // Resuming after a word lookup keeps the playhead where it was; anything
      // else (fresh step, repeat, replay) starts the clip from the top. A
      // playhead that drifted outside the clip falls back to the start.
      const insideClip = audio.currentTime >= start && audio.currentTime < end - 0.15;
      if (!armInPlace || !insideClip) {
        engineSeek = true;
        audio.currentTime = start;
      }
      enginePause = false;
      // Autoplay policy can reject this; the engine then settles into 'paused'
      // and the UI offers Resume.
      audio.play().catch(() => {});
      armed = true;
      cb.current.onArmed();
      raf = requestAnimationFrame(tick);
    };

    // currentTime assignment is silently dropped before HAVE_METADATA on Safari.
    if (audio.readyState >= 1) {
      arm();
    } else {
      audio.addEventListener('loadedmetadata', arm, { once: true });
    }

    const onSeeked = () => {
      if (engineSeek) {
        engineSeek = false;
        return;
      }
      const t = audio.currentTime;
      if (t < start - 1 || t > end + 1) cb.current.onExternalSeek(t);
    };

    const onPause = () => {
      if (enginePause) {
        enginePause = false;
        return;
      }
      if (armed && !cancelled) cb.current.onExternalPause();
    };

    const onWaiting = () => {
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => cb.current.onStall(), STALL_MS);
    };
    const onPlaying = () => window.clearTimeout(stallTimer);

    const onVisibility = () => {
      if (!document.hidden && !cancelled) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(stallTimer);
      audio.removeEventListener('loadedmetadata', arm);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // armInPlace is intentionally not a dep: it is read at arm time, and a
    // change to it alone must never re-arm playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioRef, active, start, end, rate, armToken]);
}

/**
 * Progress within the current clip, 0..1, sampled at 10fps while active.
 *
 * Deliberately its own subscription (the pattern global/useAudioProgress.ts
 * already establishes) so only the thin progress bar re-renders — the provider
 * and every step view stay still.
 */
export function useClipProgress(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  clip: ClipRange | null,
  active: boolean,
): number {
  const [progress, setProgress] = useState(0);
  const start = clip?.start ?? null;
  const end = clip?.end ?? null;
  const idle = !active || start === null || end === null || end <= start;

  useEffect(() => {
    if (idle) return;
    const span = (end as number) - (start as number);
    const id = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      setProgress(Math.min(1, Math.max(0, (audio.currentTime - (start as number)) / span)));
    }, 100);
    return () => window.clearInterval(id);
  }, [audioRef, idle, start, end]);

  // Derived rather than reset via setState, so an idle clip needs no effect.
  return idle ? 0 : progress;
}
