import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const invoke = vi.hoisted(() => vi.fn(async (_cmd: string, _args?: unknown): Promise<unknown> => ({})));
vi.mock('@tauri-apps/api/core', () => ({ invoke, convertFileSrc: (p: string) => p }));

import {
  bookTrackId,
  indexFromList,
  isHostedAudio,
  parseBookTrackId,
  readTrackIndex,
  trackNumbers,
  trackUrl,
} from '@/pages/reader/lib/book-audio';
import { ListenPass } from '@/pages/reader/lib/listen-pass';
import {
  PROGRESS_KEEP,
  RETRY_MS,
  activeLineIndex,
  loadProgress,
  nextLineTarget,
  prevLineTarget,
  reportListen,
  saveProgress,
} from '@/pages/reader/lib/book-listens';
import { bookEpisode, bookTrackOf } from '@/pages/reader/lib/book-episode';
import {
  useBookLineSteps,
  useBookListenTracker,
  useBookTrackSubtitles,
} from '@/pages/reader/lib/use-book-track';
import { useAudioHold } from '@/pages/reader/lib/use-audio-hold';
import { isBookNotInLibrary, useBookListenVersion } from '@/pages/reader/services/bookService';
import { getPlayerAudio, isBookEpisode, usePlayerStore } from '@/pages/podcast/stores/playerStore';
import type { BookEdition } from '@/pages/reader/types';
import type { PodcastEpisode } from '@/pages/podcast/types';

HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.play = () => Promise.resolve();

const edition: BookEdition = {
  id: 'edito-a1',
  label: 'Edito A1',
  language: 'fr',
  track_count: 40,
  audio_url_template: 'https://books.example.org/a1/{folder}/track{track2}.mp3',
  audio_folder_base: 100,
  page_offset: 2,
};

describe('book edition URLs', () => {
  it('fills {track}, {track2}, {track3} and {folder} from the edition', () => {
    expect(trackUrl(edition, 7)).toBe('https://books.example.org/a1/107/track07.mp3');
    expect(
      trackUrl({ ...edition, audio_url_template: 'https://x.example.org/{track3}.mp3', audio_folder_base: null }, 7),
    ).toBe('https://x.example.org/007.mp3');
    expect(trackUrl({ ...edition, audio_url_template: 'https://x.example.org/{track}.mp3' }, 12)).toBe(
      'https://x.example.org/12.mp3',
    );
  });
  it('lists 1..track_count and recognises hosted audio', () => {
    expect(trackNumbers({ ...edition, track_count: 3 })).toEqual([1, 2, 3]);
    expect(trackNumbers({ ...edition, track_count: -2 })).toEqual([]);
    expect(isHostedAudio({ ...edition, audio_url_template: 'storage://books/a1/{track}.mp3' })).toBe(true);
    expect(isHostedAudio(edition)).toBe(false);
  });
  it('round-trips the namespaced track id and rejects anything else', () => {
    expect(bookTrackId('edito-a1', 12)).toBe('book:edito-a1:12');
    expect(parseBookTrackId('book:edito-a1:12')).toEqual({ edition: 'edito-a1', track: 12 });
    expect(parseBookTrackId('0123-abcd')).toBeNull();
    expect(parseBookTrackId(null)).toBeNull();
  });
});

/** A made-up PDF whose back pages carry the book's own "audio documents" appendix. */
function fakePdf(pages: Record<number, { str: string; x: number; y: number; font?: string }[]>, numPages = 30) {
  return {
    numPages,
    getPage: async (n: number) => ({
      getTextContent: async () => ({
        items: (pages[n] ?? []).map((i) => ({
          str: i.str,
          transform: [1, 0, 0, 1, i.x, i.y],
          width: i.str.length * 5,
          height: 10,
          fontName: i.font ?? 'f1',
        })),
      }),
    }),
  } as unknown as PDFDocumentProxy;
}

describe('track index from the PDF appendix', () => {
  const appendix = {
    28: [
      { str: 'Transcriptions des documents audios', x: 50, y: 700 },
      { str: 'Unité 2 Près de moi', x: 50, y: 650 },
      // the badge carries the track number, a little left of its entry on the same baseline
      { str: 'Page 16, Dans la classe', x: 100, y: 600 },
      { str: '12', x: 70, y: 600 },
      { str: 'Page 17, Au café', x: 100, y: 560 },
      { str: '13', x: 70, y: 560 },
      // a track that goes backwards in the book was misread and is dropped
      { str: 'Page 3, Intrus', x: 100, y: 520 },
      { str: '14', x: 70, y: 520 },
      { str: '26', x: 300, y: 30 }, // printed page 26 on PDF page 28 => offset 2
    ],
  };

  it('reads each track, its unit and its PDF page (printed page + offset)', async () => {
    const index = await readTrackIndex(fakePdf(appendix), edition);
    expect(index).not.toBeNull();
    expect(index!.offset).toBe(2);
    expect(index!.byTrack.get(12)).toMatchObject({ page: 18, title: 'Dans la classe', unit: 'Unité 2 Près de moi' });
    expect(index!.byTrack.get(13)?.page).toBe(19);
    expect(index!.byTrack.has(14)).toBe(false);
    expect(index!.byPage.get(18)?.map((t) => t.track)).toEqual([12]);
  });

  it('says nothing when the book prints no such appendix', async () => {
    expect(await readTrackIndex(fakePdf({ 1: [{ str: 'Bonjour', x: 1, y: 100 }] }), edition)).toBeNull();
  });

  it('ignores a number outside the edition', async () => {
    const small = await readTrackIndex(fakePdf(appendix), { ...edition, track_count: 12 });
    expect([...small!.byTrack.keys()]).toEqual([12]);
  });

  it('takes the server list when the PDF is a scan: printed page + page_offset, off-PDF entries dropped', () => {
    const listed = indexFromList(
      {
        ...edition,
        tracks: [
          { track: 1, printed_page: null, title: 'Intro', unit: null },
          { track: 2, printed_page: 10, title: 'A', unit: 'Unité 1' },
          { track: 3, printed_page: 500, title: 'B', unit: null },
        ],
      },
      30,
    );
    expect([...listed!.byTrack.keys()]).toEqual([2]);
    expect(listed!.byTrack.get(2)!.page).toBe(12);
    expect(listed!.offset).toBe(2);
    expect(indexFromList(edition, 30)).toBeNull();
  });
});

describe('a full listen (ListenPass)', () => {
  /** Plays [from, to] at `rate` in 1 s steps of wall clock. */
  const play = (pass: ListenPass, from: number, to: number, duration: number, rate = 1, at0 = 0) => {
    let done = false;
    let at = at0;
    for (let t = from + 1; t <= to; t++) {
      at += 1000 / rate;
      done = pass.sample({ time: t, at, playing: true, rate }, duration) || done;
    }
    return { done, at };
  };

  it('counts a recording heard first to last second at normal speed', () => {
    const pass = new ListenPass();
    pass.moved(0, 0);
    expect(play(pass, 0, 20, 20).done).toBe(true);
    expect(pass.heardTo).toBe(0); // the next pass starts from nothing
  });

  it('does not count a forward skip until the listener comes back to the gap', () => {
    const pass = new ListenPass();
    pass.moved(0, 0);
    play(pass, 0, 5, 20);
    pass.moved(12, 6000); // jumped forward
    expect(play(pass, 12, 20, 20, 1, 6000).done).toBe(false);
    expect(pass.heardTo).toBeLessThan(6);
    // coming back to where they left off, then listening on, completes it
    pass.moved(5, 20000);
    expect(play(pass, 5, 20, 20, 1, 20000).done).toBe(true);
  });

  it('going back is fine: hearing a line again repeats what was heard', () => {
    const pass = new ListenPass();
    pass.moved(0, 0);
    play(pass, 0, 10, 20);
    pass.moved(4, 11000);
    const { done } = play(pass, 4, 20, 20, 1, 11000);
    expect(done).toBe(true);
  });

  it('does not count faster than 1x, but slower is fine', () => {
    const fast = new ListenPass();
    fast.moved(0, 0);
    expect(play(fast, 0, 20, 20, 2).done).toBe(false);
    const slow = new ListenPass();
    slow.moved(0, 0);
    expect(play(slow, 0, 20, 20, 0.75).done).toBe(true);
  });

  it('a jump that fired no seek event is caught by the wall clock', () => {
    const pass = new ListenPass();
    pass.moved(0, 0);
    expect(pass.sample({ time: 15, at: 1000, playing: true, rate: 1 }, 20)).toBe(false);
    expect(pass.heardTo).toBe(0);
  });

  it('counts at the real end even when the file reports a longer duration', () => {
    const pass = new ListenPass();
    pass.moved(0, 0);
    play(pass, 0, 10, 13); // duration header says 13, the audio ends at ~10.4
    expect(pass.ended(10.4)).toBe(true);
  });

  it('resumes a half-heard pass from its persisted position', () => {
    const pass = new ListenPass(8);
    pass.moved(8, 0);
    expect(play(pass, 8, 20, 20).done).toBe(true);
  });
});

describe('persisted progress and retried reports', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it('keeps how far a track was heard, and drops it when nothing is left to keep', () => {
    const store = memory();
    saveProgress('book:a:1', 12.3456, store);
    expect(loadProgress('book:a:1', store)).toBe(12.35);
    saveProgress('book:a:1', 0, store);
    expect(loadProgress('book:a:1', store)).toBe(0);
    expect(loadProgress('book:a:9', store)).toBe(0);
  });

  it('keeps only the last 40 tracks, newest last', () => {
    const store = memory();
    for (let i = 1; i <= PROGRESS_KEEP + 5; i++) saveProgress(`book:a:${i}`, i, store);
    expect(loadProgress('book:a:1', store)).toBe(0);
    expect(loadProgress('book:a:5', store)).toBe(0);
    expect(loadProgress('book:a:6', store)).toBe(6);
    expect(loadProgress(`book:a:${PROGRESS_KEEP + 5}`, store)).toBe(PROGRESS_KEEP + 5);
  });

  it('survives unreadable storage', () => {
    const broken = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
    expect(loadProgress('x', broken)).toBe(0);
    expect(() => saveProgress('x', 3, broken)).not.toThrow();
  });

  it('reports a pass once on success, and retries a lost one after 5 s then 30 s', async () => {
    const schedule = vi.fn((run: () => void) => run());
    const ok = vi.fn(async () => ({}));
    reportListen(ok, schedule);
    await Promise.resolve();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();

    const waits: number[] = [];
    const lost = vi.fn(async () => {
      throw new Error('offline');
    });
    const later: (() => void)[] = [];
    reportListen(lost, (run, ms) => {
      waits.push(ms);
      later.push(run);
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(waits).toEqual([RETRY_MS[0]]);
    later.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(waits).toEqual([5_000, 30_000]);
    later.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    // gives up after the second wait: three sends in all, the same pass each time (the server dedupes)
    expect(lost).toHaveBeenCalledTimes(3);
    expect(waits).toHaveLength(2);
  });
});

describe('book line steps', () => {
  const lines = [{ start: 0 }, { start: 5 }, { start: 10 }];
  it('previous: well into a line replays that line; just after it starts, the one before', () => {
    expect(prevLineTarget(lines, 7)).toBeCloseTo(5.01);
    expect(prevLineTarget(lines, 5.5)).toBeCloseTo(0.01);
  });
  it('previous before the first line has nothing to step to (the bar keeps -5 s)', () => {
    expect(prevLineTarget([{ start: 3 }], 1)).toBeNull();
    expect(prevLineTarget(lines, 0.2)).toBeCloseTo(0.01);
  });
  it('next: the first line that starts after now; after the last, nothing (the bar keeps +5 s)', () => {
    expect(nextLineTarget(lines, 5)).toBeCloseTo(10.01);
    expect(nextLineTarget(lines, 10.5)).toBeNull();
  });
  it('the line stays up through the pauses and goes away after the last one', () => {
    const segs = [{ start: 0, end: 2 }, { start: 5, end: 7 }];
    expect(activeLineIndex(segs, -1)).toBe(-1);
    expect(activeLineIndex(segs, 3.5)).toBe(0);
    expect(activeLineIndex(segs, 6)).toBe(1);
    expect(activeLineIndex(segs, 9)).toBe(1);
    expect(activeLineIndex(segs, 11)).toBe(-1);
  });
});

/** Gives the shared audio element a clock a test can set. */
function fakeClock() {
  const audio = getPlayerAudio();
  const state = { currentTime: 0, duration: 10, paused: true, playbackRate: 1 };
  for (const key of Object.keys(state) as (keyof typeof state)[]) {
    Object.defineProperty(audio, key, {
      configurable: true,
      get: () => state[key],
      set: (value) => void (state[key] = value as never),
    });
  }
  return { audio, state };
}

describe('book line steps wired to the player', () => {
  it('steps by the line times, from the audio element\'s own clock', () => {
    const { audio, state } = fakeClock();
    state.currentTime = 7;
    const { result } = renderHook(() => useBookLineSteps([{ start: 0 }, { start: 5 }, { start: 10 }]));
    act(() => result.current!.onPrev());
    expect(audio.currentTime).toBeCloseTo(5.01);
    act(() => result.current!.onNext());
    expect(audio.currentTime).toBeCloseTo(10.01);
  });
  it('is undefined while the line times are unknown', () => {
    const { result } = renderHook(() => useBookLineSteps([]));
    expect(result.current).toBeUndefined();
  });
});

const cloud = (handler: (method: string, path: string, body?: unknown) => unknown) => {
  invoke.mockImplementation(async (cmd: string, args?: unknown) => {
    if (cmd !== 'supabase_call') return {};
    const { method, path, body } = args as { method: string; path: string; body?: unknown };
    return handler(method, path, body);
  });
};

describe('counting listens and the subtitle lock', () => {
  beforeEach(() => {
    invoke.mockReset();
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('reports a full listen to the account, once, and keeps a half-heard pass', async () => {
    const posted: unknown[] = [];
    cloud((method, path, body) => {
      if (method === 'POST') posted.push({ path, body });
      return { counted: true };
    });
    const { audio, state } = fakeClock();
    state.currentTime = 0;
    state.paused = false;
    const clock = vi.spyOn(performance, 'now');
    clock.mockReturnValue(0);
    const { unmount } = renderHook(() => useBookListenTracker({ edition: 'edito-a1', track: 3 }));

    const tick = (t: number) => {
      state.currentTime = t;
      clock.mockReturnValue(t * 1000);
      audio.dispatchEvent(new Event('timeupdate'));
    };
    for (let t = 1; t <= 12; t++) tick(t);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ path: '/reader?action=record-track-listen', body: { edition: 'edito-a1', track: 3 } });
    unmount();

    // a second hook, interrupted halfway, keeps where it got to
    state.currentTime = 0;
    clock.mockReturnValue(0);
    const second = renderHook(() => useBookListenTracker({ edition: 'edito-a1', track: 4 }));
    for (let t = 1; t <= 5; t++) tick(t);
    second.unmount();
    expect(loadProgress('book:edito-a1:4')).toBe(5);
    expect(posted).toHaveLength(1);
  });

  it('opens on a counted listen: line times only while locked, the text once unlocked', async () => {
    let listens = 0;
    cloud((method, path) => {
      if (method === 'POST') {
        listens += 1;
        return { counted: true };
      }
      if (!path.includes('track-subtitles')) return {};
      const base = { edition: 'edito-a1', track: 3, available: true, required: 2, listens };
      return listens < 2
        ? { ...base, locked: true, lines: [{ start: 0, end: 2 }, { start: 5, end: 7 }] }
        : { ...base, locked: false, language: 'fr', segments: [{ start: 0, end: 2, text: 'Bonjour tout le monde' }, { start: 5, end: 7, text: 'Ça va ?' }] };
    });
    const key = { edition: 'edito-a1', track: 3 };
    const { result } = renderHook(() => useBookTrackSubtitles(key, 1));
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current).toMatchObject({ locked: true, listens: 0, required: 2, line: null });
    expect(result.current.lines).toHaveLength(2); // the line steps work before the text opens

    listens = 2;
    act(() => useBookListenVersion.getState().bump()); // a counted listen
    await waitFor(() => expect(result.current.locked).toBe(false));
    expect(result.current.line?.text).toBe('Bonjour tout le monde');
  });

  it('a track with no subtitles at all is not "locked"', async () => {
    cloud(() => ({ edition: 'edito-a1', track: 9, available: false, locked: true, listens: 0, required: 2, lines: [] }));
    const { result } = renderHook(() => useBookTrackSubtitles({ edition: 'edito-a1', track: 9 }, 0));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.available).toBe(false);
  });

  it('names the server\'s refusal for a copy that is not in the online library', () => {
    expect(isBookNotInLibrary(JSON.stringify({ status: 403, code: 'BOOK_NOT_IN_LIBRARY' }))).toBe(true);
    expect(isBookNotInLibrary('{"code":"UNKNOWN_ERROR"}')).toBe(false);
  });
});

describe('the book media kind in the player store', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({});
    usePlayerStore.getState().stop();
  });
  afterEach(() => usePlayerStore.getState().stop());

  const podcast: PodcastEpisode = {
    id: 'ep-1',
    feedId: 'f',
    title: 'Podcast',
    audioUrl: 'https://p.example.org/a.mp3',
    durationSeconds: 60,
    isDownloaded: false,
    playPosition: 0,
    isPlayed: false,
    transcriptStatus: 'none',
    createdAt: '2026-01-01',
    transcriptSource: 'local',
    cloudTranscriptStatus: 'unknown',
  };

  it('a track is an audio episode carrying its book, with a namespaced id', () => {
    const ep = bookEpisode(edition, 7, 'https://books.example.org/a1/107/track07.mp3', 'Dans la classe', '/reader/doc1');
    expect(ep.id).toBe('book:edito-a1:7');
    expect(isBookEpisode(ep)).toBe(true);
    expect(isBookEpisode(podcast)).toBe(false);
    expect(bookTrackOf(ep)).toMatchObject({ edition: 'edito-a1', track: 7, language: 'fr', showName: 'Edito A1', returnTo: '/reader/doc1' });
    expect(bookTrackOf(podcast)).toBeNull();
  });

  it('plays through the audio element and saves nothing as a library position', () => {
    const ep = bookEpisode(edition, 7, 'https://books.example.org/a1/107/track07.mp3', 'Dans la classe', '/reader/doc1');
    usePlayerStore.getState().play(ep);
    expect(usePlayerStore.getState().currentEpisode?.bookTrack?.track).toBe(7);
    expect(getPlayerAudio().src).toBe('https://books.example.org/a1/107/track07.mp3');
    usePlayerStore.getState().pause();
    usePlayerStore.getState().seek(3);
    usePlayerStore.getState()._onEnded();
    expect(invoke).not.toHaveBeenCalledWith('podcast_update_progress', expect.anything());
    // a track just stops: no "episode complete" screen
    expect(usePlayerStore.getState().showCompleteOverlay).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('podcasts are unchanged: their position is still saved and their end still shows the overlay', () => {
    usePlayerStore.getState().play(podcast);
    usePlayerStore.getState().pause();
    expect(invoke).toHaveBeenCalledWith('podcast_update_progress', { episodeId: 'ep-1', position: 0 });
    usePlayerStore.getState()._onEnded();
    expect(usePlayerStore.getState().showCompleteOverlay).toBe(true);
  });

  it('a podcast started after a track takes over the one audio element', () => {
    usePlayerStore.getState().play(bookEpisode(edition, 2, 'https://books.example.org/a1/102/track02.mp3', 'T', '/reader/d'));
    usePlayerStore.getState().play(podcast);
    expect(usePlayerStore.getState().currentEpisode?.id).toBe('ep-1');
    expect(isBookEpisode(usePlayerStore.getState().currentEpisode)).toBe(false);
  });
});

describe('audio hold', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({});
  });
  afterEach(() => usePlayerStore.getState().stop());

  const startTrack = async () => {
    usePlayerStore.getState().play(bookEpisode(edition, 1, 'https://books.example.org/a1/101/track01.mp3', 'T', '/reader/d'));
    await act(async () => {}); // let play() settle first
    usePlayerStore.setState({ isPlaying: true });
  };

  it('pauses the recording while something is read and resumes it afterwards', async () => {
    await startTrack();
    const { rerender } = renderHook(({ held }) => useAudioHold(held), { initialProps: { held: false } });
    rerender({ held: true });
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    rerender({ held: false });
    await waitFor(() => expect(usePlayerStore.getState().isPlaying).toBe(true));
  });

  it('does not start a recording the reader had paused on purpose', async () => {
    await startTrack();
    usePlayerStore.setState({ isPlaying: false });
    const { rerender } = renderHook(({ held }) => useAudioHold(held), { initialProps: { held: false } });
    rerender({ held: true });
    rerender({ held: false });
    await act(async () => {});
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});
