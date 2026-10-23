import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeakOutcome } from '@/lib/speech';

// A voice the test answers by hand: every piece waits until the test says how it ended.
const voice = vi.hoisted(() => ({
  said: [] as string[],
  pending: [] as Array<(o: SpeakOutcome) => void>,
  stops: 0,
  prefetched: [] as string[],
  planned: 'cloud' as 'cloud' | 'local',
}));
vi.mock('@/lib/speech', () => ({
  speakThrough: (text: string) => {
    voice.said.push(text);
    return new Promise<SpeakOutcome>((resolve) => voice.pending.push(resolve));
  },
  stop: () => {
    voice.stops += 1;
  },
  prefetchSpeech: (text: string) => voice.prefetched.push(text),
  plannedVoice: () => voice.planned,
  adjustSpeech: () => {},
  speak: async () => {},
  getSpeechState: () => ({ speaking: false, loading: false, text: null, lang: null }),
  useSpeechState: () => ({ speaking: false, loading: false, text: null, lang: null }),
}));

const settings = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/tauri-bridge', async (original) => ({
  ...(await original<typeof import('@/lib/tauri-bridge')>()),
  getSetting: async (key: string) => settings.get(key) ?? null,
  setSetting: async (key: string, value: string) => void settings.set(key, value),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null), convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));

// The library: three pages of one episode.
const PAGES: Record<number, string> = {
  1: 'Margaret arrived at noon. She put the bag down.',
  2: 'Inside were six notebooks. Each had a year on it.',
  3: 'Then she left.',
};
const call = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabaseCall: call }));

import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { useListenStore, type ListenSource } from '@/pages/reader/listen/listenStore';
import { listenPlaceKey } from '@/pages/reader/text/listen-sequence';
import type { PodcastEpisode } from '@/pages/podcast/types';

// A book past the open episodes (not a serial): the cloud voice's limits apply.
const SOURCE: ListenSource = {
  bookId: 'b1',
  title: 'The Lesson Plans',
  subtitle: 'by FlexiLingo',
  language: 'en',
  coverPath: null,
  requiresLogin: false,
  seriesOrder: null,
  nextEpisode: null,
};

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};
/** The sentence being said ends (or is cut off); let the player take its next step. */
const finish = async (outcome: SpeakOutcome = 'ended') => {
  voice.pending.shift()?.(outcome);
  await settle();
};
const state = () => useListenStore.getState();
const as = (who: 'pro' | 'free' | 'out') => {
  useAuthStore.setState({ session: who === 'out' ? null : ({ user: { id: 'u' } } as never), isLoading: false });
  useSubscriptionStore.setState({
    subscription: who === 'pro' ? ({ tier: 'pro' } as never) : null,
    hasResolved: true,
  });
};
const openAt = (page: number, sentence = 0) =>
  state().start(SOURCE, { page, sentence, text: PAGES[page], hasNext: page < 3, pageCount: 3 });

beforeEach(() => {
  voice.said.length = 0;
  voice.pending.length = 0;
  voice.stops = 0;
  voice.prefetched.length = 0;
  voice.planned = 'cloud';
  settings.clear();
  call.mockReset();
  call.mockImplementation(async (_method: string, path: string) => {
    const n = Number(/page=(\d+)/.exec(path)?.[1]);
    return {
      book_id: 'b1',
      title: 'x',
      language: 'en',
      page_number: n,
      page_count: 3,
      chapter_title: null,
      content: PAGES[n],
      word_count: 8,
      char_count: 40,
      truncated: false,
      has_prev: n > 1,
      has_next: n < 3,
    };
  });
  as('pro');
});
afterEach(() => {
  state().close();
  vi.restoreAllMocks();
});

describe('the player reads sentence by sentence', () => {
  it('in order, fetching the next sentence ahead', async () => {
    openAt(1);
    expect(voice.said).toEqual(['Margaret arrived at noon.']);
    expect(voice.prefetched).toEqual(['She put the bag down.']);
    expect(state()).toMatchObject({ status: 'playing', index: 0, page: 1 });
    await finish();
    expect(voice.said.at(-1)).toBe('She put the bag down.');
    expect(state().index).toBe(1);
  });

  it('repeat says the same sentence again until it is switched off', async () => {
    openAt(1);
    state().toggleRepeat();
    await finish();
    await finish();
    expect(voice.said).toEqual(['Margaret arrived at noon.', 'Margaret arrived at noon.', 'Margaret arrived at noon.']);
    state().toggleRepeat();
    await finish();
    expect(voice.said.at(-1)).toBe('She put the bag down.');
  });

  it('previous: the sentence before within 1.5 s, this one again after that', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    openAt(1, 1);
    now.mockReturnValue(11_000);
    state().prev();
    expect(voice.said.at(-1)).toBe('Margaret arrived at noon.');
    expect(state().index).toBe(0);

    state().next();
    expect(state().index).toBe(1);
    now.mockReturnValue(13_000);
    state().prev();
    expect(voice.said.at(-1)).toBe('She put the bag down.');
    expect(state().index).toBe(1);
  });

  it('previous on a page’s first sentence goes back to the page before’s last', async () => {
    openAt(2);
    state().prev();
    await settle();
    expect(state()).toMatchObject({ page: 1, index: 1 });
    expect(voice.said.at(-1)).toBe('She put the bag down.');
  });
});

describe('the end of a page', () => {
  it('Pro: the next page is fetched and read from its top, to the end of the book', async () => {
    openAt(2);
    await finish();
    await finish();
    expect(state()).toMatchObject({ page: 3, index: 0, status: 'playing' });
    expect(voice.said.at(-1)).toBe('Then she left.');
    await finish();
    expect(state()).toMatchObject({ page: 3, status: 'paused', invite: null });
  });

  it('next on a page’s last sentence follows the same rule', async () => {
    openAt(1, 1);
    state().next();
    await settle();
    expect(state()).toMatchObject({ page: 2, index: 0 });
  });

  it('without Pro: the page is read, then Pro is offered and nothing is fetched', async () => {
    as('free');
    openAt(1);
    await finish();
    await finish();
    expect(state()).toMatchObject({ page: 1, status: 'paused', invite: 'pro' });
    expect(call).not.toHaveBeenCalled();
    state().next();
    expect(state().invite).toBe('pro');
  });

  it('signed out, the cloud voice does not start on a gated book (the page offers sign-up)', () => {
    as('out');
    openAt(1, 1);
    expect(state().source).toBeNull();
    expect(voice.said).toEqual([]);
  });

  it('while the session loads, a gated book does not start on the cloud voice', () => {
    useAuthStore.setState({ session: null, isLoading: true });
    openAt(1);
    expect(state().source).toBeNull();
    useAuthStore.setState({ isLoading: false });
  });
});

describe('one voice, one player', () => {
  it('another voice cutting in pauses the reading where it was', async () => {
    openAt(1);
    await finish('cut');
    expect(state()).toMatchObject({ status: 'paused', index: 0, invite: null });
  });

  it('pause stops the voice; play says the sentence again from its start', async () => {
    openAt(1, 1);
    state().pause();
    expect(voice.stops).toBeGreaterThan(0);
    expect(state().status).toBe('paused');
    await finish('cut');
    expect(state().status).toBe('paused');
    state().playPause();
    expect(voice.said.at(-1)).toBe('She put the bag down.');
    expect(state().status).toBe('playing');
  });

  it('a page turned by hand is read from its top', async () => {
    openAt(1, 1);
    state().follow({ page: 2, text: PAGES[2], hasNext: true, pageCount: 3 });
    expect(state()).toMatchObject({ page: 2, index: 0, status: 'playing' });
    expect(voice.said.at(-1)).toBe('Inside were six notebooks.');
  });

  it('starting it stops a podcast in the bar; a podcast starting closes it', () => {
    const episode = { id: 'ep1', title: 'An episode' } as unknown as PodcastEpisode;
    usePlayerStore.setState({ currentEpisode: episode });
    openAt(1);
    expect(usePlayerStore.getState().currentEpisode).toBeNull();
    expect(state().source?.bookId).toBe('b1');

    usePlayerStore.setState({ currentEpisode: episode });
    expect(state().source).toBeNull();
    usePlayerStore.setState({ currentEpisode: null });
  });

  it('the place is kept per book for «continue listening»', async () => {
    openAt(1);
    await finish();
    state().close();
    await settle();
    expect(JSON.parse(settings.get(listenPlaceKey('b1')) ?? '{}')).toEqual({ page: 1, sentence: 1 });
  });
});

describe('the first five episodes, and going on from episode to episode', () => {
  const ORDERS = [1, 2, 3, 4, 5, 6, 7];
  const detailOf = (n: number) => ({
    book: {
      id: `e${n}`, slug: `tuesday-${n}`, language: 'en', title: `Episode ${n}`, author: 'FlexiLingo',
      kind: 'original', level: 'B1', summary: '', series_slug: 'tuesday', series_title: 'The Tuesday Class',
      series_order: n, series_season: 1, series_episode: n, requires_login: false, tags: [], cover_path: null,
      word_count: 10, page_count: 1, license: 'own', source_url: null, attribution: null, published_at: null,
      updated_at: '2026-01-01',
    },
    first_page: null,
    series: ORDERS.map((k) => ({
      id: `e${k}`, slug: `tuesday-${k}`, title: `Episode ${k}`, level: 'B1', series_order: k, series_season: 1, series_episode: k,
    })),
    series_meta: { title: 'The Tuesday Class', seasons: [{ number: 1, title: null }] },
  });
  const textOf = (n: number) => `Episode ${n} begins and ends here.`;
  const episode = (n: number): ListenSource => ({
    bookId: `e${n}`,
    title: `Episode ${n}`,
    subtitle: 'The Tuesday Class',
    language: 'en',
    coverPath: null,
    requiresLogin: false,
    seriesOrder: n,
    nextEpisode: n < 7 ? { bookId: `e${n + 1}`, order: n + 1 } : null,
  });
  const listenTo = (n: number) =>
    state().start(episode(n), { page: 1, sentence: 0, text: textOf(n), hasNext: false, pageCount: 1 });

  beforeEach(() => {
    call.mockImplementation(async (_method: string, path: string) => {
      const n = Number(/book_id=e(\d+)/.exec(path)?.[1]);
      if (path.includes('action=book&')) return detailOf(n);
      return {
        book_id: `e${n}`, title: `Episode ${n}`, language: 'en', page_number: 1, page_count: 1, chapter_title: null,
        content: textOf(n), word_count: 6, char_count: 30, truncated: false, has_prev: false, has_next: false,
      };
    });
  });

  it('an open episode goes on to the next by itself, for a signed-out reader too (cloud voice)', async () => {
    as('out');
    listenTo(3);
    expect(voice.said).toEqual([textOf(3)]);
    await finish();
    expect(state().source).toMatchObject({ bookId: 'e4', seriesOrder: 4 });
    expect(voice.said.at(-1)).toBe(textOf(4));
  });

  it('the end of episode 5, signed out: the sign-up invitation, and it stops', async () => {
    as('out');
    listenTo(5);
    await finish();
    expect(state()).toMatchObject({ status: 'paused', invite: 'signIn' });
    expect(state().source?.bookId).toBe('e5');
  });

  it('the end of episode 5, free: the Pro offer, and it stops', async () => {
    as('free');
    listenTo(5);
    await finish();
    expect(state()).toMatchObject({ status: 'paused', invite: 'pro' });
  });

  it('the end of episode 5, Pro: on into episode 6', async () => {
    as('pro');
    listenTo(5);
    await finish();
    expect(state().source?.bookId).toBe('e6');
    expect(voice.said.at(-1)).toBe(textOf(6));
  });

  it('the computer’s own voice has no limits: a free reader goes on past episode 5', async () => {
    as('free');
    voice.planned = 'local';
    listenTo(5);
    await finish();
    expect(state().source?.bookId).toBe('e6');
  });

  it('the last episode is the end', async () => {
    as('pro');
    listenTo(7);
    await finish();
    expect(state()).toMatchObject({ status: 'paused', invite: null });
    expect(state().source?.bookId).toBe('e7');
  });
});
