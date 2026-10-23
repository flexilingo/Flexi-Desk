import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import {
  planEngines,
  speak,
  stop,
  availableEngines,
  clearSpeechCache,
  prefetchSpeech,
  type SpeechEnv,
} from '@/lib/speech';
import { chunkText, cloudPaths, regionFor } from '@/lib/speechVoices';
import { useAuthStore } from '@/stores/authStore';

const env = (over: Partial<SpeechEnv> = {}): SpeechEnv => ({
  signedIn: true,
  deviceAvailable: true,
  deviceHasVoice: true,
  systemAvailable: true,
  ...over,
});

describe('planEngines', () => {
  it('goes cloud, device, system when signed in', () => {
    expect(planEngines(env())).toEqual(['cloud', 'device', 'system']);
  });
  it('leaves the cloud out when signed out', () => {
    expect(planEngines(env({ signedIn: false }))).toEqual(['device', 'system']);
  });
  it('puts a device voice that cannot speak the language after the system voice', () => {
    expect(planEngines(env({ deviceHasVoice: false }))).toEqual(['cloud', 'system', 'device']);
  });
  it('works with the device voice alone (Windows, signed out, no Rust voice)', () => {
    expect(planEngines(env({ signedIn: false, systemAvailable: false }))).toEqual(['device']);
  });
  it('is empty when nothing can speak', () => {
    expect(
      planEngines(env({ signedIn: false, deviceAvailable: false, systemAvailable: false })),
    ).toEqual([]);
  });
  it('puts a chosen engine first but ignores an unusable choice', () => {
    expect(planEngines(env(), 'device')).toEqual(['device', 'cloud', 'system']);
    expect(planEngines(env({ signedIn: false }), 'cloud')).toEqual(['device', 'system']);
  });
});

describe('voice tables', () => {
  it('maps languages and accents to Microsoft voices, then the own voice', () => {
    expect(regionFor('en', 'uk')).toBe('en-GB');
    expect(regionFor('fr')).toBe('fr-FR');
    expect(regionFor('fr-CA')).toBe('fr-CA');
    expect(regionFor('xx')).toBeNull();
    const paths = cloudPaths('hello', 'en', 'uk');
    expect(paths[0]).toContain('engine=microsoft&voice=en-GB-SoniaNeural');
    expect(paths[1]).toContain('accent=uk');
    expect(cloudPaths('x', 'xx')).toEqual([]);
  });
  it('chunks long text under the server cap at sentence ends', () => {
    const sentence = 'This is a sentence. ';
    const chunks = chunkText(sentence.repeat(60));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 440)).toBe(true);
    expect(chunks.every((c) => c.endsWith('.'))).toBe(true);
    expect(chunkText('  ')).toEqual([]);
  });
});

describe('speak fallback order', () => {
  const deviceSpoken: string[] = [];
  let deviceFails = false;
  let audioPlayed = 0;

  beforeEach(() => {
    invokeMock.mockReset();
    deviceSpoken.length = 0;
    deviceFails = false;
    audioPlayed = 0;
    class Utterance {
      lang = '';
      voice: unknown;
      onstart?: () => void;
      onend?: () => void;
      onerror?: (e: { error: string }) => void;
      constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        getVoices: () => [{ name: 'Voice', lang: 'en-US', localService: true }],
        speak: (u: Utterance) => {
          deviceSpoken.push(u.text);
          queueMicrotask(() =>
            deviceFails ? u.onerror?.({ error: 'synthesis-failed' }) : u.onend?.(),
          );
        },
      },
    });
    class FakeAudio {
      onended?: () => void;
      onerror?: () => void;
      onplaying?: () => void;
      constructor(public src: string) {}
      pause() {}
      play() {
        audioPlayed += 1;
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    useAuthStore.setState({
      session: {
        access_token: 't',
        refresh_token: 'r',
        user_id: 'u',
        email: 'a@b.c',
        expires_at: 0,
      },
    });
  });
  afterEach(() => {
    stop();
    clearSpeechCache();
    useAuthStore.setState({ session: null });
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    vi.unstubAllGlobals();
  });

  it('plays the cloud voice when signed in and never touches the device voice', async () => {
    invokeMock.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    await speak('hello', 'en');
    expect(invokeMock.mock.calls[0][0]).toBe('supabase_fetch_bytes');
    expect(invokeMock.mock.calls[0][1].path).toContain('engine=microsoft');
    expect(audioPlayed).toBe(1);
    expect(deviceSpoken).toEqual([]);
  });

  it('tries the own voice next, then falls to the device voice when the cloud fails', async () => {
    invokeMock.mockRejectedValue(new Error('HTTP_500'));
    await speak('hello', 'en');
    const paths = invokeMock.mock.calls
      .filter((c) => c[0] === 'supabase_fetch_bytes')
      .map((c) => c[1].path);
    expect(paths).toHaveLength(2);
    expect(paths[1]).not.toContain('engine=microsoft');
    expect(audioPlayed).toBe(0);
    expect(deviceSpoken).toEqual(['hello']);
  });

  it('skips the cloud entirely when signed out', async () => {
    useAuthStore.setState({ session: null });
    await speak('hello', 'en');
    expect(invokeMock).not.toHaveBeenCalled();
    expect(deviceSpoken).toEqual(['hello']);
  });

  it('uses the Rust system voice last, after the cloud and the device voice both fail', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    deviceFails = true;
    invokeMock.mockImplementation((cmd: string) =>
      cmd === 'supabase_fetch_bytes' ? Promise.reject(new Error('HTTP_500')) : Promise.resolve(),
    );
    await speak('hello', 'en');
    const order = invokeMock.mock.calls.map((c) => c[0]);
    expect(order).toEqual(['supabase_fetch_bytes', 'supabase_fetch_bytes', 'tutor_speak_text']);
    expect(deviceSpoken).toEqual(['hello']);
    expect(invokeMock.mock.calls[2][1]).toEqual({ text: 'hello', language: 'en' });
  });

  it('a reader’s player fetches the next clip ahead and reuses it; a word is still fetched each time', async () => {
    invokeMock.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const fetches = () => invokeMock.mock.calls.filter((c) => c[0] === 'supabase_fetch_bytes').length;
    prefetchSpeech('The next sentence.', 'en');
    await new Promise((r) => setTimeout(r, 0));
    expect(fetches()).toBe(1);
    await speak('The next sentence.', 'en', { cache: true });
    expect(fetches()).toBe(1);
    expect(audioPlayed).toBe(1);
    await speak('The next sentence.', 'en');
    expect(fetches()).toBe(2);
  });

  it('reports which engines are available', () => {
    expect(availableEngines('en')).toEqual(['cloud', 'device']);
    useAuthStore.setState({ session: null });
    expect(availableEngines('en')).toEqual(['device']);
  });
});
