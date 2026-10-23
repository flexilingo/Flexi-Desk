/**
 * Who may listen to a library book, and how far it reads on by itself — the owner's rule, as
 * pure functions.
 *
 * With the CLOUD voice (it costs us):
 *   1. A serial episode up to FREE_LISTEN_EPISODES (series_order, which counts across seasons):
 *      everyone listens, page after page, and at its end the player goes on to the next episode
 *      while that one is open too.
 *   2. At the end of the last open episode: signed out → the sign-up invitation; free → the Pro
 *      offer; Pro → on it goes.
 *   3. Any later episode, and any book that is not a serial episode: signed out → the player is
 *      locked («sign up free to listen»); free → page by page, the Pro offer at each page end;
 *      Pro → page after page, episode after episode.
 * With the computer's OWN voice (the device's, or the Mac's system speech) there are no limits:
 * the user's own machine, at no cost to us — everything plays, page after page, for everyone.
 * While the session or the plan is still loading, a gated book does not start on the cloud voice
 * (and an open one shows no lock).
 *
 * The speaker after each paragraph is not the player: it reads its paragraph for everyone,
 * always (see `listenStart`'s callers).
 */

export const FREE_LISTEN_EPISODES = 5;

export type ListenVoice = 'cloud' | 'local';

export interface ListenAccessFacts {
  /** The voice that will speak: FlexiLingo's cloud voice, or the computer's own. */
  voice: ListenVoice;
  /** Null while the session is still loading. */
  signedIn: boolean | null;
  /** Null while the plan is still loading (false when signed out). */
  pro: boolean | null;
  /** The book's place in its series, counted across seasons; null for a book that is not a serial episode. */
  seriesOrder: number | null;
}

/** A serial episode the cloud voice reads for everyone, page after page. */
export const isOpenEpisode = (order: number | null | undefined): boolean =>
  typeof order === 'number' && order >= 1 && order <= FREE_LISTEN_EPISODES;

/** Whether the player may start on this book: play, ask to sign up (locked), or wait for the session. */
export type ListenStart = 'play' | 'signUp' | 'wait';

export function listenStart(f: ListenAccessFacts): ListenStart {
  if (f.voice === 'local' || isOpenEpisode(f.seriesOrder)) return 'play';
  if (f.signedIn === null) return 'wait';
  return f.signedIn ? 'play' : 'signUp';
}

/** Going on by itself: go, or stop and say why ('wait': the session or plan is not known yet). */
export type ListenGo = { kind: 'go' } | { kind: 'stop'; reason: 'signIn' | 'pro' | 'wait' };

const GO: ListenGo = { kind: 'go' };

/** The gated rule: signed out → sign up; free → Pro; Pro → go. */
function gated(f: ListenAccessFacts): ListenGo {
  if (f.signedIn === null) return { kind: 'stop', reason: 'wait' };
  if (!f.signedIn) return { kind: 'stop', reason: 'signIn' };
  if (f.pro === null) return { kind: 'stop', reason: 'wait' };
  return f.pro ? GO : { kind: 'stop', reason: 'pro' };
}

/** At the end of a page with another page after it. */
export function pageTurn(f: ListenAccessFacts): ListenGo {
  if (f.voice === 'local' || isOpenEpisode(f.seriesOrder)) return GO;
  return gated(f);
}

/**
 * At the end of an episode: on to the next one, or stop and say why. No next episode (the series
 * ends, or the book is not a serial) is the end.
 */
export function episodeTurn(
  f: ListenAccessFacts,
  next: { order: number } | null,
): ListenGo | { kind: 'stop'; reason: 'end' } {
  if (!next || f.seriesOrder === null) return { kind: 'stop', reason: 'end' };
  if (f.voice === 'local' || isOpenEpisode(next.order)) return GO;
  return gated(f);
}
