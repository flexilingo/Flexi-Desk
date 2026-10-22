import { create } from 'zustand';
import { supabaseCall } from '@/lib/supabase';
import type { BookEdition } from '../types';

/**
 * The book editions on the account, through `supabaseCall` (never `fetch` from JS).
 * Names follow the website's `readerApi.ts`. Every action needs a signed-in account
 * (`reader` rejects a caller without one), so callers skip these while signed out.
 *
 * Everything here works for a LOCAL document too except `getBookTrackAudio`, which
 * the server signs only for a caller whose own cloud document names the edition —
 * see `isBookNotInLibrary`.
 */

export interface BookTrackListens {
  edition: string;
  required: number;
  /** Full listens per track number; a track not in here has none. */
  listens: Record<number, number>;
  /** The tracks that have subtitles at all. */
  subtitled: number[];
}

export interface BookTrackSubtitles {
  edition: string;
  track: number;
  /** False when the track has no subtitles at all — not the same as locked. */
  available: boolean;
  locked: boolean;
  listens: number;
  required: number;
  language?: string;
  /** Only once unlocked. */
  segments?: { start: number; end: number; text: string }[];
  /** While locked: when each line starts and ends, without its text — for the line steps. */
  lines?: { start: number; end: number }[];
}

/** Bumped after a listen is counted, so everything showing a count asks again. */
export const useBookListenVersion = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

export const getBookEditions = () =>
  supabaseCall<{ items: BookEdition[] }>('GET', '/reader?action=book-editions');

export const getBookTrackAudio = (edition: string) =>
  supabaseCall<{ edition: string; urls: Record<string, string> }>(
    'GET',
    `/reader?action=track-audio&edition=${encodeURIComponent(edition)}`,
  );

/**
 * "This account picked this edition" — what unlocks a hosted book's recordings for a
 * local document (`reader?action=claim-edition`). A server that does not have the action
 * yet answers 400/404; the caller ignores that and the panel keeps its calm state.
 */
export const claimBookEdition = (edition: string) =>
  supabaseCall<{ edition: string; claimed: boolean }>('POST', '/reader?action=claim-edition', {
    edition,
  });

export const getBookTrackListens = (edition: string) =>
  supabaseCall<BookTrackListens>(
    'GET',
    `/reader?action=track-listens&edition=${encodeURIComponent(edition)}`,
  );

export const getBookTrackSubtitles = (edition: string, track: number) =>
  supabaseCall<BookTrackSubtitles>(
    'GET',
    `/reader?action=track-subtitles&edition=${encodeURIComponent(edition)}&track=${track}`,
  );

/** One full listen, as the player measured it. The server refuses to count the same pass twice. */
export const recordBookTrackListen = (body: { edition: string; track: number }) =>
  supabaseCall<{
    edition: string;
    track: number;
    listens: number;
    required: number;
    counted: boolean;
  }>('POST', '/reader?action=record-track-listen', body).then((answer) => {
    useBookListenVersion.getState().bump();
    return answer;
  });

/**
 * The server signs a hosted edition's recordings only for a caller whose own cloud
 * document names the edition (`BOOK_NOT_IN_LIBRARY`, 403). A desk document is local,
 * so that is what a hosted book answers here.
 */
export function isBookNotInLibrary(cause: unknown): boolean {
  // `supabase_call` rejects with the answer's JSON as a string.
  const text = typeof cause === 'string' ? cause : JSON.stringify(cause ?? '');
  return text.includes('BOOK_NOT_IN_LIBRARY');
}
