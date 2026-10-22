import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPlayerAudio, usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { bookTrackId } from './book-audio';
import { ListenPass } from './listen-pass';
import {
  activeLineIndex,
  loadProgress,
  nextLineTarget,
  prevLineTarget,
  reportListen,
  saveProgress,
} from './book-listens';
import {
  getBookTrackListens,
  getBookTrackSubtitles,
  recordBookTrackListen,
  useBookListenVersion,
  type BookTrackListens,
  type BookTrackSubtitles,
} from '../services/bookService';

/**
 * A book track in the player: counting full listens, and the subtitles they open.
 * Ported from the website's `useBookTrack.ts`.
 *
 * Lives beside the player rather than in the reader because the recording keeps
 * playing when the reader is left — a listen that finishes on another page is still
 * a listen.
 */

export interface BookTrackKey {
  edition: string;
  track: number;
}

/**
 * Watch the shared `<audio>` element while it holds a book track, and report each
 * full listen (see `ListenPass` for what "full" means) to the account.
 */
export function useBookListenTracker(bookTrack: BookTrackKey | null) {
  const edition = bookTrack?.edition ?? null;
  const track = bookTrack?.track ?? null;

  useEffect(() => {
    if (edition === null || track === null) return;
    const audio = getPlayerAudio();
    const id = bookTrackId(edition, track);
    const pass = new ListenPass(loadProgress(id));
    pass.moved(audio.currentTime, performance.now());
    let saved = pass.heardTo;

    const report = () => reportListen(() => recordBookTrackListen({ edition, track }));
    const persist = (force = false) => {
      if (!force && Math.abs(pass.heardTo - saved) < 2) return;
      saved = pass.heardTo;
      saveProgress(id, pass.heardTo);
    };

    const onTimeUpdate = () => {
      const done = pass.sample(
        {
          time: audio.currentTime,
          at: performance.now(),
          playing: !audio.paused,
          rate: audio.playbackRate,
        },
        audio.duration,
      );
      if (done) report();
      persist(done);
    };
    const onMoved = () => pass.moved(audio.currentTime, performance.now());
    const onEnded = () => {
      if (pass.ended(audio.currentTime)) report();
      persist(true);
    };
    const onPause = () => persist(true);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('seeking', onMoved);
    audio.addEventListener('emptied', onMoved);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('seeking', onMoved);
      audio.removeEventListener('emptied', onMoved);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      persist(true);
    };
  }, [edition, track]);
}

/**
 * A book track's subtitles, and where the learner stands on opening them. The server
 * sends no text while the track is locked — only when each line starts and ends.
 */
export function useBookTrackSubtitles(bookTrack: BookTrackKey | null, currentTime: number) {
  const edition = bookTrack?.edition ?? null;
  const track = bookTrack?.track ?? null;
  const version = useBookListenVersion((s) => s.version);
  const [data, setData] = useState<BookTrackSubtitles | null>(null);

  useEffect(() => {
    if (edition === null || track === null) {
      setData(null);
      return;
    }
    let cancelled = false;
    getBookTrackSubtitles(edition, track)
      .then((answer) => !cancelled && setData(answer))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
    // A counted listen asks again: that is how the subtitles open.
  }, [edition, track, version]);

  // Only the answer for the track being held — never the previous one's while the new one loads.
  const current = data && data.edition === edition && data.track === track ? data : null;
  const segments = useMemo(() => current?.segments ?? [], [current?.segments]);
  const lines = useMemo(
    () => current?.segments ?? current?.lines ?? [],
    [current?.segments, current?.lines],
  );
  const activeIndex = useMemo(
    () => activeLineIndex(segments, currentTime),
    [segments, currentTime],
  );

  return {
    /** The track has subtitles at all. */
    available: !!current?.available,
    locked: current?.locked ?? true,
    listens: current?.listens ?? 0,
    required: current?.required ?? 0,
    language: current?.language,
    lines,
    /** The line on screen, with its text — null while locked, before the first line, or after the last. */
    line: activeIndex >= 0 ? (segments[activeIndex] ?? null) : null,
    lineIndex: activeIndex,
  };
}

/**
 * The player's line back / forward for a book track — the full player's rule: well
 * into a line, back means that line again; just after it starts, the one before.
 * Undefined while the track's line times are unknown, so the bar keeps -5 s / +5 s.
 */
export function useBookLineSteps(lines: { start: number }[]) {
  const seek = usePlayerStore((s) => s.seek);
  const skipBack = usePlayerStore((s) => s.skipBack);
  const skipForward = usePlayerStore((s) => s.skipForward);

  // The audio element's own clock, not the store's: a second press arrives before the
  // next timeupdate, and must step from where the first one landed.
  const onPrev = useCallback(() => {
    const target = prevLineTarget(lines, getPlayerAudio().currentTime);
    if (target === null) skipBack(5);
    else seek(target);
  }, [lines, seek, skipBack]);

  const onNext = useCallback(() => {
    const target = nextLineTarget(lines, getPlayerAudio().currentTime);
    if (target === null) skipForward(5);
    else seek(target);
  }, [lines, seek, skipForward]);

  return useMemo(
    () => (lines.length > 0 ? { onPrev, onNext } : undefined),
    [lines.length, onPrev, onNext],
  );
}

/**
 * Where the learner stands on every track of one book — one call for the whole list,
 * so the audio panel can mark each row. Asked again after every counted listen.
 */
export function useTrackListens(edition: string) {
  const version = useBookListenVersion((s) => s.version);
  const [data, setData] = useState<BookTrackListens | null>(null);
  useEffect(() => {
    let cancelled = false;
    getBookTrackListens(edition)
      .then((answer) => !cancelled && setData(answer))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [edition, version]);
  return data;
}
