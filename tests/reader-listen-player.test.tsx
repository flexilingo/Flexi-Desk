import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SpeakOutcome } from '@/lib/speech';

// A voice the test answers by hand: every piece waits until the test says how it ended.
const voice = vi.hoisted(() => ({
  said: [] as string[],
  pending: [] as Array<(o: SpeakOutcome) => void>,
  stop: { calls: 0 },
}));
vi.mock('@/lib/speech', () => ({
  speakThrough: (text: string) => {
    voice.said.push(text);
    return new Promise<SpeakOutcome>((resolve) => voice.pending.push(resolve));
  },
  stop: () => {
    voice.stop.calls += 1;
  },
  speak: async () => {},
  getSpeechState: () => ({ speaking: false, loading: false, text: null, lang: null }),
  useSpeechState: () => ({ speaking: false, loading: false, text: null, lang: null }),
}));

import { usePageListen } from '@/pages/reader/text/usePageListen';
import type { ReaderPagerState } from '@/pages/reader/text/useReaderPager';

const PAGES: Record<number, string> = {
  1: 'Margaret arrived at noon.\n\nShe put the bag on the desk.',
  2: 'Inside were six notebooks.',
  3: 'Then she left.',
};

const next = vi.fn();
const pagerAt = (page: number): ReaderPagerState =>
  ({
    page,
    total: 3,
    text: PAGES[page],
    title: '',
    language: 'en',
    truncated: false,
    chapterTitle: null,
    hasPrev: page > 1,
    hasNext: page < 3,
    isLoading: false,
    isFetching: false,
    error: null,
    goTo: vi.fn(),
    next,
    prev: vi.fn(),
    retry: vi.fn(),
  }) as unknown as ReaderPagerState;

type Props = { page: number; signedIn: boolean; pro: boolean };
const open = (props: Props) =>
  renderHook(
    ({ page, signedIn, pro }: Props) =>
      usePageListen({ pager: pagerAt(page), language: 'en', enabled: true, signedIn, pro }),
    { initialProps: props },
  );

/** The piece being said ends; let the player take its next step. */
const finish = async (outcome: SpeakOutcome = 'ended') => {
  await act(async () => {
    voice.pending.shift()?.(outcome);
  });
};

beforeEach(() => {
  voice.said.length = 0;
  voice.pending.length = 0;
  voice.stop.calls = 0;
  next.mockReset();
});

describe('the Listen player', () => {
  it('Pro: reads the page paragraph by paragraph, highlighting each, turns the page and stops at the book’s end', async () => {
    const view = open({ page: 1, signedIn: true, pro: true });
    act(() => view.result.current.start());
    expect(voice.said).toEqual(['Margaret arrived at noon.']);
    expect(view.result.current).toMatchObject({ status: 'playing', active: 0 });

    await finish();
    expect(voice.said.at(-1)).toBe('She put the bag on the desk.');
    expect(view.result.current.active).toBe(1);

    await finish();
    expect(next).toHaveBeenCalledTimes(1);
    view.rerender({ page: 2, signedIn: true, pro: true });
    expect(voice.said.at(-1)).toBe('Inside were six notebooks.');
    expect(view.result.current.active).toBe(0);

    await finish();
    view.rerender({ page: 3, signedIn: true, pro: true });
    expect(voice.said.at(-1)).toBe('Then she left.');

    await finish();
    expect(next).toHaveBeenCalledTimes(2);
    expect(view.result.current).toMatchObject({ status: 'idle', active: null, invite: null });
  });

  it('without Pro: page 1 is read, then Pro is offered instead of turning the page', async () => {
    const view = open({ page: 1, signedIn: true, pro: false });
    act(() => view.result.current.start());
    await finish();
    await finish();
    expect(next).not.toHaveBeenCalled();
    expect(view.result.current).toMatchObject({ status: 'idle', invite: 'pro' });
  });

  it('signed out: page 1 is read, then signing in is asked for first', async () => {
    const view = open({ page: 1, signedIn: false, pro: false });
    act(() => view.result.current.start());
    await finish();
    await finish();
    expect(next).not.toHaveBeenCalled();
    expect(view.result.current.invite).toBe('signIn');
    // Turning the page by hand takes the invitation away.
    view.rerender({ page: 2, signedIn: false, pro: false });
    expect(view.result.current.invite).toBeNull();
  });

  it('anything else speaking ends the reading cleanly, with nothing offered', async () => {
    const view = open({ page: 1, signedIn: true, pro: true });
    act(() => view.result.current.start());
    await finish('cut');
    expect(view.result.current).toMatchObject({ status: 'idle', active: null, invite: null });
    expect(voice.said).toHaveLength(1);
  });

  it('pause keeps the place and resume says the interrupted piece again', async () => {
    const view = open({ page: 1, signedIn: true, pro: true });
    act(() => view.result.current.start());
    await finish();
    act(() => view.result.current.pause());
    expect(voice.stop.calls).toBe(1);
    expect(view.result.current).toMatchObject({ status: 'paused', active: 1 });
    // The cut-off piece reports back late; the paused player ignores it.
    await finish('cut');
    expect(view.result.current.status).toBe('paused');

    act(() => view.result.current.resume());
    expect(voice.said.at(-1)).toBe('She put the bag on the desk.');
    expect(view.result.current.status).toBe('playing');

    act(() => view.result.current.stop());
    expect(view.result.current).toMatchObject({ status: 'idle', active: null });
  });

  it('a page turned by hand while it plays is read from its top', async () => {
    const view = open({ page: 1, signedIn: true, pro: false });
    act(() => view.result.current.start());
    view.rerender({ page: 2, signedIn: true, pro: false });
    expect(voice.said.at(-1)).toBe('Inside were six notebooks.');
    // The first page's piece, cut off by the new one, changes nothing.
    await finish('cut');
    expect(view.result.current).toMatchObject({ status: 'playing', active: 0 });
  });

  it('leaving the page stops the voice', () => {
    const view = open({ page: 1, signedIn: true, pro: true });
    act(() => view.result.current.start());
    view.unmount();
    expect(voice.stop.calls).toBe(1);
  });
});
