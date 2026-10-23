import { describe, expect, it } from 'vitest';
import {
  FREE_LISTEN_EPISODES,
  episodeTurn,
  isOpenEpisode,
  listenStart,
  pageTurn,
  type ListenAccessFacts,
} from '@/pages/reader/listen/listen-access';
import { atPageEnd, type ListenFacts } from '@/pages/reader/text/listen-sequence';

type Who = 'out' | 'free' | 'pro' | 'loading' | 'tierLoading';
const WHO: Record<Who, Pick<ListenAccessFacts, 'signedIn' | 'pro'>> = {
  out: { signedIn: false, pro: false },
  free: { signedIn: true, pro: false },
  pro: { signedIn: true, pro: true },
  loading: { signedIn: null, pro: null },
  tierLoading: { signedIn: true, pro: null },
};
const facts = (who: Who, seriesOrder: number | null, voice: 'cloud' | 'local' = 'cloud'): ListenAccessFacts => ({
  voice,
  seriesOrder,
  ...WHO[who],
});
const GO = { kind: 'go' };
const stop = (reason: string) => ({ kind: 'stop', reason });

describe('the open episodes', () => {
  it('are the first five of a series, counted across seasons', () => {
    expect(FREE_LISTEN_EPISODES).toBe(5);
    expect([1, 5].map(isOpenEpisode)).toEqual([true, true]);
    expect([0, 6, 21].map(isOpenEpisode)).toEqual([false, false, false]);
    expect(isOpenEpisode(null)).toBe(false);
  });
});

describe('starting the player (the cloud voice)', () => {
  it('an open episode plays for everyone — and shows no lock while the session loads', () => {
    for (const who of Object.keys(WHO) as Who[]) {
      expect(listenStart(facts(who, 3))).toBe('play');
      expect(listenStart(facts(who, 5))).toBe('play');
    }
  });

  it('a later episode, a later season or a book that is not a serial: locked when signed out', () => {
    for (const order of [6, 21, null]) {
      expect(listenStart(facts('out', order))).toBe('signUp');
      expect(listenStart(facts('free', order))).toBe('play');
      expect(listenStart(facts('pro', order))).toBe('play');
      expect(listenStart(facts('tierLoading', order))).toBe('play');
    }
  });

  it('while the session is loading a gated book waits — no cloud audio, no lock', () => {
    expect(listenStart(facts('loading', 6))).toBe('wait');
    expect(listenStart(facts('loading', null))).toBe('wait');
  });
});

describe('turning the page by itself (the cloud voice)', () => {
  it('an open episode turns for everyone', () => {
    for (const who of Object.keys(WHO) as Who[]) expect(pageTurn(facts(who, 4))).toEqual(GO);
  });

  it('a gated book: free stops with the Pro offer, Pro goes on, signed out is asked to sign up', () => {
    for (const order of [6, 21, null]) {
      expect(pageTurn(facts('free', order))).toEqual(stop('pro'));
      expect(pageTurn(facts('pro', order))).toEqual(GO);
      expect(pageTurn(facts('out', order))).toEqual(stop('signIn'));
      expect(pageTurn(facts('loading', order))).toEqual(stop('wait'));
      expect(pageTurn(facts('tierLoading', order))).toEqual(stop('wait'));
    }
  });
});

describe('going on to the next episode (the cloud voice)', () => {
  it('from an open episode into another open one: everyone', () => {
    for (const who of Object.keys(WHO) as Who[]) {
      expect(episodeTurn(facts(who, 3), { order: 4 })).toEqual(GO);
      expect(episodeTurn(facts(who, 4), { order: 5 })).toEqual(GO);
    }
  });

  it('at the end of episode 5: sign up when signed out, the Pro offer when free, on for Pro', () => {
    expect(episodeTurn(facts('out', 5), { order: 6 })).toEqual(stop('signIn'));
    expect(episodeTurn(facts('free', 5), { order: 6 })).toEqual(stop('pro'));
    expect(episodeTurn(facts('pro', 5), { order: 6 })).toEqual(GO);
    expect(episodeTurn(facts('tierLoading', 5), { order: 6 })).toEqual(stop('wait'));
  });

  it('later episodes (into the next season too): Pro goes on, free gets the Pro offer', () => {
    expect(episodeTurn(facts('pro', 20), { order: 21 })).toEqual(GO);
    expect(episodeTurn(facts('free', 20), { order: 21 })).toEqual(stop('pro'));
  });

  it('the last episode, or a book that is not a serial, is the end', () => {
    expect(episodeTurn(facts('pro', 60), null)).toEqual(stop('end'));
    expect(episodeTurn(facts('pro', null), { order: 2 })).toEqual(stop('end'));
  });
});

describe('the computer’s own voice has no limits', () => {
  it('everything plays and reads on, for everyone — a signed-out reader on a gated book too', () => {
    for (const who of Object.keys(WHO) as Who[]) {
      for (const order of [3, 5, 6, 21, null]) {
        expect(listenStart(facts(who, order, 'local'))).toBe('play');
        expect(pageTurn(facts(who, order, 'local'))).toEqual(GO);
      }
      expect(episodeTurn(facts(who, 5, 'local'), { order: 6 })).toEqual(GO);
      expect(episodeTurn(facts(who, 20, 'local'), { order: 21 })).toEqual(GO);
    }
  });

  it('but the end of the series is still the end', () => {
    expect(episodeTurn(facts('out', 60, 'local'), null)).toEqual(stop('end'));
  });
});

describe('the page-end move of the player', () => {
  const base = (who: Who, seriesOrder: number | null, more: Partial<ListenFacts> = {}): ListenFacts => ({
    ...facts(who, seriesOrder),
    hasNext: true,
    hasPrev: false,
    nextEpisode: null,
    ...more,
  });

  it('a page with another after it: turn, or stop with the reason', () => {
    expect(atPageEnd(base('out', 2))).toEqual({ kind: 'turn' });
    expect(atPageEnd(base('free', 8))).toEqual({ kind: 'stop', reason: 'pro' });
  });

  it('the last page: on to the next episode, the invitation, or the end', () => {
    expect(atPageEnd(base('out', 2, { hasNext: false, nextEpisode: { order: 3 } }))).toEqual({ kind: 'nextEpisode' });
    expect(atPageEnd(base('out', 5, { hasNext: false, nextEpisode: { order: 6 } }))).toEqual({
      kind: 'stop',
      reason: 'signIn',
    });
    expect(atPageEnd(base('pro', 5, { hasNext: false, nextEpisode: { order: 6 } }))).toEqual({ kind: 'nextEpisode' });
    expect(atPageEnd(base('pro', 60, { hasNext: false }))).toEqual({ kind: 'stop', reason: 'end' });
  });
});
