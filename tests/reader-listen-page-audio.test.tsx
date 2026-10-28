import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SpeakOutcome } from '@/lib/speech';

// The voice stack, answered by hand: what it was asked to say, and who else is speaking.
const voice = vi.hoisted(() => ({
  said: [] as string[],
  planned: 'cloud' as 'cloud' | 'local',
  state: { speaking: false, loading: false, text: null as string | null, lang: null },
  listeners: new Set<() => void>(),
}));
vi.mock('@/lib/speech', () => ({
  speakThrough: (text: string) => {
    voice.said.push(text);
    return new Promise<SpeakOutcome>(() => {});
  },
  stop: () => {},
  prefetchSpeech: () => {},
  plannedVoice: () => voice.planned,
  adjustSpeech: () => {},
  speak: async () => {},
  getSpeechProgress: () => null,
  getSpeechState: () => voice.state,
  useSpeechState: () => voice.state,
  subscribeSpeech: (fn: () => void) => {
    voice.listeners.add(fn);
    return () => voice.listeners.delete(fn);
  },
}));

// The <audio> element that plays a page's narration: a fake that records what it was told.
const audio = vi.hoisted(() => {
  class FakeAudio extends EventTarget {
    loads: string[] = [];
    private source = '';
    currentTime = 0;
    duration = Number.NaN;
    paused = true;
    ended = false;
    readyState = 4;
    playbackRate = 1;
    volume = 1;
    preload = '';
    error: { code: number } | null = null;
    plays = 0;
    get src() {
      return this.source;
    }
    set src(url: string) {
      this.source = url;
      this.loads.push(url);
    }
    play() {
      this.paused = false;
      this.ended = false;
      this.plays += 1;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    emit(type: string) {
      this.dispatchEvent(new Event(type));
    }
  }
  return { el: new FakeAudio() };
});
vi.mock('@/pages/reader/listen/page-audio-element', () => ({
  createPageAudio: () => audio.el,
}));

const settings = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/tauri-bridge', async (original) => ({
  ...(await original<typeof import('@/lib/tauri-bridge')>()),
  getSetting: async (key: string) => settings.get(key) ?? null,
  setSetting: async (key: string, value: string) => void settings.set(key, value),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
  convertFileSrc: (p: string) => p,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/components/WordDialog', () => ({ WordDialog: () => null }));
vi.mock('@/components/auth/SignInDialog', () => ({ SignInDialog: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) => (o ? `${key}${JSON.stringify(o)}` : key),
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
const call = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabaseCall: call }));

import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { ListenMiniPlayer } from '@/pages/reader/listen/ListenMiniPlayer';
import { useListenStore, type ListenSource } from '@/pages/reader/listen/listenStore';
import {
  alignWords,
  heardMs,
  pageAudioTrack,
  placeAt,
  sentenceStartTime,
  textWords,
} from '@/pages/reader/listen/page-audio';
import { pageSentences } from '@/pages/reader/text/listen-sequence';
import type { LibraryPageAudio } from '@/pages/reader/services/libraryService';

// Punctuation, a run of spaces and a price the narrator says in words («2 $» → «deux dollars»).
const PAGE_1 =
  'Marc ouvre le café,   très tôt.  Il dit : bonjour !\n\nTout coûte 2 $. Merci beaucoup.';
const timed = (
  words: Array<[string, number]>,
  url: string,
  duration: number,
): LibraryPageAudio => ({
  audio_url: url,
  duration_s: duration,
  word_timing: words.map(([word, start], i) => ({
    word,
    start_s: start,
    end_s: words[i + 1]?.[1] ?? duration,
  })),
});
const URL_1 = 'https://api.flexilingo.com/storage/v1/object/public/tts-audio/audiobook/b1/1.mp3';
const URL_2 = 'https://api.flexilingo.com/storage/v1/object/public/tts-audio/audiobook/b1/2.mp3';
const AUDIO_1 = timed(
  [
    ['Marc', 0],
    ['ouvre', 0.4],
    ['le', 0.8],
    ['café', 1.0],
    ['très', 1.5],
    ['tôt', 1.8],
    ['Il', 2.6],
    ['dit', 2.8],
    ['bonjour', 3.1],
    ['Tout', 4.0],
    ['coûte', 4.3],
    ['deux', 4.7],
    ['dollars', 5.0],
    ['Merci', 6.0],
    ['beaucoup', 6.4],
  ],
  URL_1,
  7.2,
);
const PAGES: Record<number, { text: string; audio: LibraryPageAudio | null }> = {
  1: { text: PAGE_1, audio: AUDIO_1 },
  2: {
    text: 'La machine arrive. Elle est neuve.',
    audio: timed(
      [
        ['La', 0.1],
        ['machine', 0.3],
        ['arrive', 0.8],
        ['Elle', 1.6],
        ['est', 1.8],
        ['neuve', 2.0],
      ],
      URL_2,
      3,
    ),
  },
  // No narration: the old way, sentence by sentence.
  3: { text: 'Then she left. The end.', audio: null },
};

const SOURCE: ListenSource = {
  bookId: 'b1',
  title: 'La Machine',
  subtitle: 'by FlexiLingo',
  language: 'fr',
  coverPath: null,
  requiresLogin: false,
  seriesOrder: null,
  nextEpisode: null,
};

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};
const state = () => useListenStore.getState();
const as = (who: 'pro' | 'free') => {
  useAuthStore.setState({ session: { user: { id: 'u' } } as never, isLoading: false });
  useSubscriptionStore.setState({
    subscription: who === 'pro' ? ({ tier: 'pro' } as never) : null,
    hasResolved: true,
  });
};
const openAt = (page: number, sentence = 0) =>
  state().start(SOURCE, {
    page,
    sentence,
    text: PAGES[page].text,
    hasNext: page < 3,
    pageCount: 3,
    audio: PAGES[page].audio,
  });
/** The file has played to `t` seconds. */
const playTo = (t: number) => {
  audio.el.currentTime = t;
  audio.el.emit('timeupdate');
};

beforeEach(() => {
  voice.said.length = 0;
  voice.planned = 'cloud';
  voice.state = { speaking: false, loading: false, text: null, lang: null };
  Object.assign(audio.el, {
    loads: [],
    currentTime: 0,
    duration: 7.2,
    paused: true,
    ended: false,
    error: null,
    plays: 0,
  });
  useListenStore.setState({ repeat: false, rate: 1, volume: 1 });
  settings.clear();
  call.mockReset();
  call.mockImplementation(async (_method: string, path: string) => {
    const n = Number(/page=(\d+)/.exec(path)?.[1]);
    return {
      book_id: 'b1',
      title: 'La Machine',
      language: 'fr',
      page_number: n,
      page_count: 3,
      chapter_title: null,
      content: PAGES[n].text,
      word_count: 10,
      char_count: 60,
      truncated: false,
      has_prev: n > 1,
      has_next: n < 3,
      audio: PAGES[n].audio,
    };
  });
  as('pro');
});
afterEach(() => {
  state().close();
  vi.restoreAllMocks();
});

describe('a page’s narration, as pure functions', () => {
  const sentences = pageSentences(PAGE_1);
  const track = pageAudioTrack(sentences, AUDIO_1)!;

  it('counts words only — never the spaces and punctuation tokenize also returns', () => {
    expect(sentences.map((s) => s.text)).toEqual([
      'Marc ouvre le café,   très tôt.',
      'Il dit : bonjour !',
      'Tout coûte 2 $.',
      'Merci beaucoup.',
    ]);
    expect(textWords('Marc ouvre le café,   très tôt.')).toEqual([
      'Marc',
      'ouvre',
      'le',
      'café',
      'très',
      'tôt',
    ]);
    expect(textWords('Il dit : bonjour !')).toEqual(['Il', 'dit', 'bonjour']);
  });

  it('the word being said is the one the timing says: its sentence and its place among that sentence’s words', () => {
    expect(placeAt(track, 0)).toEqual({ sentence: 0, word: 0 });
    // «tôt», the sixth word, after a comma and three spaces.
    expect(placeAt(track, 1.9)).toEqual({ sentence: 0, word: 5 });
    // «bonjour», after « : ».
    expect(placeAt(track, 3.2)).toEqual({ sentence: 1, word: 2 });
    // A clock that reads a hair before a word's start (a seek landing on it) is already on it.
    expect(placeAt(track, 2.59)).toEqual({ sentence: 1, word: 0 });
  });

  it('a word said differently from how it is written does not put the words after it one off', () => {
    expect(
      alignWords(
        ['Tout', 'coûte', '2', 'Merci', 'beaucoup'],
        ['Tout', 'coûte', 'deux', 'dollars', 'Merci', 'beaucoup'],
      ),
    ).toEqual([0, 1, 2, 2, 3, 4]);
    // «deux» and «dollars» are both the written «2»; «beaucoup» is still «beaucoup».
    expect(placeAt(track, 4.8)).toEqual({ sentence: 2, word: 2 });
    expect(placeAt(track, 5.1)).toEqual({ sentence: 2, word: 2 });
    expect(placeAt(track, 6.5)).toEqual({ sentence: 3, word: 1 });
    // Same words, different case and apostrophe: in step.
    expect(alignWords(["AUJOURD'HUI", 'CAFÉ'], ['Aujourd’hui', 'café'])).toEqual([0, 1]);
  });

  it('where each sentence starts in the file, and how much of it was heard', () => {
    expect([0, 1, 2, 3].map((n) => sentenceStartTime(track, n))).toEqual([0, 2.6, 4.0, 6.0]);
    expect(heardMs(track, 1, 3.1)).toBeCloseTo(500);
  });

  it('no narration, no address or no timing: nothing to play — the page is read the old way', () => {
    expect(pageAudioTrack(sentences, null)).toBeNull();
    expect(pageAudioTrack(sentences, undefined)).toBeNull();
    expect(pageAudioTrack(sentences, { ...AUDIO_1, audio_url: '' })).toBeNull();
    expect(pageAudioTrack(sentences, { ...AUDIO_1, word_timing: [] })).toBeNull();
  });
});

describe('the player on a page with narration', () => {
  it('plays the page’s one file — the voice is not asked for any sentence', () => {
    openAt(1);
    expect(audio.el.src).toBe(URL_1);
    expect(audio.el.plays).toBe(1);
    expect(audio.el.paused).toBe(false);
    expect(voice.said).toEqual([]);
    expect(state()).toMatchObject({ status: 'playing', index: 0, page: 1 });
    expect(state().pageAudio?.url).toBe(URL_1);
  });

  it('starting at a sentence starts the file at that sentence’s first word', () => {
    openAt(1, 2);
    expect(audio.el.currentTime).toBe(4.0);
    expect(state().index).toBe(2);
  });

  it('the sentence and the word follow the file’s clock; the bar’s line is its real time', () => {
    openAt(1);
    playTo(3.2);
    expect(state().index).toBe(1);
    expect(state().clock).toEqual({ time: 3.2, duration: 7.2 });
    expect(state().followAudio()).toEqual({ sentence: 1, word: 2 });
  });

  it('next and previous seek inside the same file — no new file is loaded', () => {
    openAt(1);
    const loads = [...audio.el.loads];
    playTo(2.7);
    state().next();
    expect(audio.el.currentTime).toBe(4.0);
    expect(state().index).toBe(2);
    // Within 1.5 s of its start: the sentence before.
    playTo(4.5);
    state().prev();
    expect(audio.el.currentTime).toBe(2.6);
    expect(state().index).toBe(1);
    // Well into it: this sentence again.
    state().jump(0);
    playTo(2.0);
    state().prev();
    expect(audio.el.currentTime).toBe(0);
    expect(state().index).toBe(0);
    expect(audio.el.loads).toEqual(loads);
    expect(audio.el.src).toBe(URL_1);
    expect(voice.said).toEqual([]);
  });

  it('the bar’s line seeks the file to that second', () => {
    openAt(1);
    state().seekTime(5.1);
    expect(audio.el.currentTime).toBe(5.1);
    expect(state().index).toBe(2);
  });

  it('pause keeps the place; play goes on from it', () => {
    openAt(1);
    playTo(3.3);
    state().pause();
    expect(audio.el.paused).toBe(true);
    expect(state().status).toBe('paused');
    state().playPause();
    expect(audio.el.paused).toBe(false);
    expect(audio.el.currentTime).toBe(3.3);
    expect(state().status).toBe('playing');
  });

  it('repeat holds the file on its sentence', () => {
    openAt(1, 1);
    state().toggleRepeat();
    playTo(4.05);
    expect(audio.el.currentTime).toBe(2.6);
    expect(state().index).toBe(1);
  });

  it('another voice cutting in (a word said) pauses the file where it was', () => {
    openAt(1);
    voice.state = { ...voice.state, loading: true, text: 'café' };
    for (const listener of voice.listeners) listener();
    expect(audio.el.paused).toBe(true);
    expect(state().status).toBe('paused');
  });

  it('the end of the file is the end of the page — Pro: the next page’s own file plays', async () => {
    openAt(1);
    playTo(7.1);
    audio.el.emit('ended');
    await settle();
    expect(state().page).toBe(2);
    expect(audio.el.loads.at(-1)).toBe(URL_2);
    expect(audio.el.src).toBe(URL_2);
    expect(state()).toMatchObject({ status: 'playing', index: 0 });
    expect(voice.said).toEqual([]);
  });

  it('the end of the file without Pro: the Pro offer, as at the end of a page read the old way', async () => {
    as('free');
    openAt(1);
    audio.el.emit('ended');
    await settle();
    expect(state()).toMatchObject({ status: 'paused', invite: 'pro', page: 1 });
    expect(call).not.toHaveBeenCalled();
  });

  it('a file that cannot be played: the page is read the old way, from the same sentence', () => {
    openAt(1, 1);
    audio.el.error = { code: 4 };
    audio.el.emit('error');
    expect(state().pageAudio).toBeNull();
    expect(voice.said).toEqual(['Il dit : bonjour !']);
  });
});

describe('a page without narration, or the computer’s own voice: the old way, unchanged', () => {
  it('audio null: sentence by sentence through the voice, the file never touched', () => {
    openAt(3);
    expect(voice.said).toEqual(['Then she left.']);
    expect(state().pageAudio).toBeNull();
    expect(audio.el.plays).toBe(0);
  });

  it('the next page without narration, after one with it, is read by the voice', async () => {
    openAt(2);
    audio.el.emit('ended');
    await settle();
    expect(state().page).toBe(3);
    expect(state().pageAudio).toBeNull();
    expect(voice.said).toEqual(['Then she left.']);
  });

  it('starting another book without narration stops the file before the voice reads', () => {
    openAt(1);
    expect(audio.el.paused).toBe(false);
    state().start(
      { ...SOURCE, bookId: 'b2' },
      { page: 1, sentence: 0, text: 'Then she left.', audio: null },
    );
    expect(audio.el.paused).toBe(true);
    expect(voice.said).toEqual(['Then she left.']);
    expect(state().pageAudio).toBeNull();
  });

  it('the computer’s own voice reads even a narrated page itself (no limits, no file)', () => {
    voice.planned = 'local';
    openAt(1);
    expect(voice.said).toEqual(['Marc ouvre le café,   très tôt.']);
    expect(state().pageAudio).toBeNull();
    expect(audio.el.plays).toBe(0);
  });

  it('an open episode plays its file for everyone, signed out too — as on the website', () => {
    voice.planned = 'local';
    useAuthStore.setState({ session: null, isLoading: false });
    state().start(
      { ...SOURCE, seriesOrder: 2 },
      { page: 1, sentence: 0, text: PAGES[1].text, hasNext: true, pageCount: 3, audio: PAGES[1].audio },
    );
    expect(state().pageAudio).not.toBeNull();
    expect(voice.said).toEqual([]);
    expect(audio.el.plays).toBe(1);
  });
});

describe('the bar on a narrated page', () => {
  it('its line is the file’s real time over its length, not the sentence count', () => {
    openAt(1);
    playTo(1.8);
    const { container } = render(
      <MemoryRouter>
        <ListenMiniPlayer />
      </MemoryRouter>,
    );
    const line = container.querySelector<HTMLElement>('[style*="width"]');
    expect(line?.style.width).toBe('25%');
  });
});
