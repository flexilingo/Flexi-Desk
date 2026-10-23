import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import {
  spokenWordIndex,
  spokenWords,
  wordAtChar,
  wordAtFraction,
} from '@/pages/reader/text/word-follow';
import { clearSpeechCache, getSpeechProgress, speak, stop, type SpeechProgress } from '@/lib/speech';
import { useAuthStore } from '@/stores/authStore';

describe('word weights', () => {
  it('letters + 2 per word, plus the pause after it: a comma 3, the end of a sentence 5', () => {
    expect(spokenWords('Hello, world.')).toEqual([
      { start: 0, weight: 5 + 2 + 3 },
      { start: 7, weight: 5 + 2 + 5 },
    ]);
    expect(spokenWords('I see; then: yes!').map((w) => w.weight)).toEqual([1 + 2, 3 + 2 + 3, 4 + 2 + 3, 3 + 2 + 5]);
  });

  it('the page’s own words: an apostrophe or a hyphen keeps a word whole, a Han character is a word', () => {
    expect(spokenWords("Don't well-known").map((w) => w.weight)).toEqual([4 + 2, 9 + 2]);
    expect(spokenWords('你好。').map((w) => w.weight)).toEqual([3, 3 + 5]);
  });
});

describe('wordAtFraction', () => {
  const weights = [10, 12];

  it('lays the played fraction over the cumulative weights', () => {
    expect(wordAtFraction(weights, 0)).toBe(0);
    expect(wordAtFraction(weights, 0.45)).toBe(0);
    expect(wordAtFraction(weights, 0.46)).toBe(1);
    expect(wordAtFraction(weights, 1)).toBe(1);
  });

  it('keeps out-of-range and broken fractions on the text; nothing to say is -1', () => {
    expect(wordAtFraction(weights, -0.2)).toBe(0);
    expect(wordAtFraction(weights, 7)).toBe(1);
    expect(wordAtFraction(weights, Number.NaN)).toBe(0);
    expect(wordAtFraction([], 0.5)).toBe(-1);
  });

  it('a long word takes a longer share of the clip', () => {
    const w = spokenWords('A extraordinarily b.').map((x) => x.weight);
    expect(wordAtFraction(w, 0.2)).toBe(1);
    expect(wordAtFraction(w, 0.7)).toBe(1);
    expect(wordAtFraction(w, 0.95)).toBe(2);
  });
});

describe('wordAtChar (a device voice’s word boundaries)', () => {
  it('the word that starts at or before the boundary', () => {
    const words = spokenWords('Hello brave world.');
    expect(wordAtChar(words, 0)).toBe(0);
    expect(wordAtChar(words, 6)).toBe(1);
    expect(wordAtChar(words, 12)).toBe(2);
    expect(wordAtChar([], 3)).toBe(-1);
  });
});

describe('spokenWordIndex: which word of the sentence', () => {
  const pieces = ['One two three.', 'Four five six.'];

  it('cloud: the words of the earlier pieces and chunks, then the place in the clip', () => {
    const progress: SpeechProgress = {
      engine: 'cloud',
      text: 'Four five six.',
      chunks: ['Four five', 'six.'],
      chunkIndex: 1,
      fraction: 0.5,
    };
    expect(spokenWordIndex(pieces, 1, progress)).toBe(3 + 2 + 0);
    expect(spokenWordIndex(pieces, 1, { ...progress, chunkIndex: 0, fraction: 0.9 })).toBe(3 + 1);
  });

  it('device: exact, from the boundary', () => {
    expect(spokenWordIndex(pieces, 0, { engine: 'device', text: 'One two three.', charIndex: 4 })).toBe(1);
  });

  it('the system voice tells nothing; another text is not this sentence', () => {
    expect(spokenWordIndex(pieces, 0, { engine: 'system', text: 'One two three.' })).toBeNull();
    expect(spokenWordIndex(pieces, 0, { engine: 'device', text: 'Something else.', charIndex: 0 })).toBeNull();
    expect(spokenWordIndex(pieces, 0, null)).toBeNull();
  });
});

describe('the voice says where it is', () => {
  let utterances: Array<{
    text: string;
    onstart?: () => void;
    onend?: () => void;
    onboundary?: (e: { name?: string; charIndex: number }) => void;
  }> = [];
  let clips: Array<{ currentTime: number; duration: number; onplaying?: () => void; onended?: () => void }> = [];

  beforeEach(() => {
    utterances = [];
    clips = [];
    class Utterance {
      lang = '';
      voice: unknown;
      rate = 1;
      volume = 1;
      constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        getVoices: () => [{ name: 'Voice', lang: 'en-US', localService: true }],
        speak: (u: (typeof utterances)[number]) => utterances.push(u),
      },
    });
    class FakeAudio {
      currentTime = 0;
      duration = Number.NaN;
      playbackRate = 1;
      volume = 1;
      onplaying?: () => void;
      onended?: () => void;
      onerror?: () => void;
      constructor(public src: string) {
        clips.push(this);
      }
      pause() {}
      play() {
        queueMicrotask(() => this.onplaying?.());
        return Promise.resolve();
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    stop();
    clearSpeechCache();
    useAuthStore.setState({ session: null });
    vi.unstubAllGlobals();
  });

  it('a device voice: its word boundaries, exactly', async () => {
    const done = speak('Hello brave world.', 'en');
    expect(getSpeechProgress()).toBeNull();
    utterances[0].onstart?.();
    expect(getSpeechProgress()).toEqual({ engine: 'device', text: 'Hello brave world.', charIndex: 0 });
    utterances[0].onboundary?.({ name: 'word', charIndex: 6 });
    expect(spokenWordIndex(['Hello brave world.'], 0, getSpeechProgress())).toBe(1);
    utterances[0].onend?.();
    await done;
    expect(getSpeechProgress()).toBeNull();
  });

  it('a cloud clip: how far into it the sound is', async () => {
    useAuthStore.setState({ session: { user: { id: 'u' } } as never });
    invokeMock.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const done = speak('Hello brave world.', 'en');
    await vi.waitFor(() => expect(clips).toHaveLength(1));
    await vi.waitFor(() => expect(getSpeechProgress()).not.toBeNull());
    clips[0].duration = 3;
    clips[0].currentTime = 1.5;
    expect(getSpeechProgress()).toMatchObject({ engine: 'cloud', chunkIndex: 0, fraction: 0.5 });
    clips[0].onended?.();
    await done;
  });
});
