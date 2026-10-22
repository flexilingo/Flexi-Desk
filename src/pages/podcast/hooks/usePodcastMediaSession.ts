import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import {
  getLineSteppers,
  mediaPlaybackState,
  pushPositionState,
  registerMediaHandlers,
  type MediaSessionLike,
} from '../utils/mediaSession';

const sessionOrNull = (): MediaSessionLike | null =>
  typeof navigator !== 'undefined' && 'mediaSession' in navigator
    ? (navigator.mediaSession as unknown as MediaSessionLike)
    : null;

/** Wires the playing episode into the OS media controls. Mounted once, in the Shell. */
export function usePodcastMediaSession() {
  const episode = usePlayerStore((s) => s.currentEpisode);
  const feed = usePlayerStore((s) => s.currentFeed);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const duration = usePlayerStore((s) => s.duration);
  const rate = usePlayerStore((s) => s.playbackRate);

  useEffect(() => {
    const session = sessionOrNull();
    if (!session) return;
    if (!episode) {
      session.metadata = null;
      return;
    }
    const art = episode.imageUrl ?? feed?.artworkUrl;
    session.metadata = new window.MediaMetadata({
      title: episode.title,
      artist: feed?.title ?? 'FlexiLingo',
      album: 'FlexiLingo',
      artwork: art ? [{ src: art, sizes: '512x512' }] : [],
    });
  }, [episode, feed]);

  useEffect(() => {
    const session = sessionOrNull();
    if (session) session.playbackState = mediaPlaybackState(!!episode, isPlaying);
  }, [episode, isPlaying]);

  useEffect(() => {
    const session = sessionOrNull();
    if (!session || !episode) return;
    const s = usePlayerStore.getState();
    pushPositionState(session, { duration, position: s.currentTime, rate });
  }, [episode, duration, rate, isPlaying]);

  useEffect(() => {
    const session = sessionOrNull();
    if (!session || !episode) return;
    const store = () => usePlayerStore.getState();
    return registerMediaHandlers(session, {
      play: () => {
        if (!store().isPlaying) store().resume();
      },
      pause: () => {
        if (store().isPlaying) store().pause();
      },
      skip: (seconds) => (seconds < 0 ? store().skipBack(-seconds) : store().skipForward(seconds)),
      seekTo: (time) => store().seek(time),
      prevLine: () => getLineSteppers()?.prevLine(),
      nextLine: () => getLineSteppers()?.nextLine(),
    });
  }, [episode]);
}
