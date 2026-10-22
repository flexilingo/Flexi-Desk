import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { getBookTrackAudio, isBookNotInLibrary } from '../services/bookService';
import { isHostedAudio, parseBookTrackId, trackUrl, type BookEdition } from './book-audio';
import { bookEpisode } from './book-episode';

/**
 * Hosted recordings, as far as the server lets this copy have them:
 *  - `pending`: asked, no answer yet — a click is simply too early;
 *  - `ready`: signed links for every track;
 *  - `needs-account-copy`: the server signs only for a caller whose own CLOUD document
 *    names the edition, and a desk document is local — the panel says so, calmly;
 *  - `failed`: any other trouble (offline, signed out).
 */
export type HostedAudio = 'not-hosted' | 'pending' | 'ready' | 'needs-account-copy' | 'failed';

/**
 * Playing the book's recordings through the app's own player.
 *
 * NOT a second player. The mini player already holds one piece of audio, survives
 * navigation and has a scrubber, skip buttons and a volume control. A track is
 * handed to it as an episode of the `book` kind (`PodcastEpisode.bookTrack`), and
 * everything below translates "track 7 of Édito A1" into what that player understands.
 */
export function useTrackPlayer(
  edition: BookEdition | null,
  options: { label: (track: number) => string },
) {
  const episode = usePlayerStore((s) => s.currentEpisode);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const playError = usePlayerStore((s) => s.playError);
  const play = usePlayerStore((s) => s.play);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const signedIn = useAuthStore((s) => !!s.session);
  const { pathname, search } = useLocation();

  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  const hosted = edition !== null && isHostedAudio(edition);
  const [signed, setSigned] = useState<{
    edition: string;
    state: Exclude<HostedAudio, 'not-hosted' | 'pending'>;
    urls: Record<string, string>;
  } | null>(null);

  // A book whose recordings we hold: fetched now, so the click starts the sound at once.
  useEffect(() => {
    if (!hosted || !edition) return;
    let cancelled = false;
    getBookTrackAudio(edition.id)
      .then(
        (answer) =>
          !cancelled && setSigned({ edition: edition.id, state: 'ready', urls: answer.urls }),
      )
      .catch((cause) => {
        if (cancelled) return;
        setSigned({
          edition: edition.id,
          state: isBookNotInLibrary(cause) ? 'needs-account-copy' : 'failed',
          urls: {},
        });
      });
    return () => {
      cancelled = true;
    };
  }, [hosted, edition, signedIn]);

  const hostedAudio: HostedAudio = !hosted
    ? 'not-hosted'
    : signed && signed.edition === edition?.id
      ? signed.state
      : 'pending';

  /** Which track the player is holding right now, if it is one of this book's at all. */
  const current = useMemo(() => {
    const held = parseBookTrackId(episode?.id);
    return edition && episode?.bookTrack && held?.edition === edition.id ? held.track : null;
  }, [episode, edition]);

  const toggle = useCallback(
    (track: number) => {
      if (!edition) return;

      // Already the one loaded: a pause or a resume, not a new load — which is what
      // keeps the position when you come back to a recording.
      if (current === track) {
        togglePlayPause();
        return;
      }

      const audioUrl = hosted ? signed?.urls[String(track)] : trackUrl(edition, track);
      if (!audioUrl) {
        // Not signed for this reader, or no file at that number. Only once the
        // server has answered — before that, the click is simply too early.
        if (hostedAudio !== 'pending') setFailed((previous) => new Set(previous).add(track));
        return;
      }

      play(bookEpisode(edition, track, audioUrl, options.label(track), `${pathname}${search}`));
      setFailed((previous) => {
        if (!previous.has(track)) return previous;
        const next = new Set(previous);
        next.delete(track);
        return next;
      });
    },
    [
      edition,
      current,
      togglePlayPause,
      play,
      options,
      pathname,
      search,
      hosted,
      signed,
      hostedAudio,
    ],
  );

  // A track the publisher does not have at that number. Recorded so the reader is not
  // left pressing a button that never does anything.
  useEffect(() => {
    if (playError && current !== null)
      setFailed((previous) => (previous.has(current) ? previous : new Set(previous).add(current)));
  }, [playError, current]);

  return {
    playing: isPlaying && current !== null ? current : null,
    loading: isBuffering && current !== null ? current : null,
    failed,
    hostedAudio,
    toggle,
  };
}

export type TrackPlayer = ReturnType<typeof useTrackPlayer>;
