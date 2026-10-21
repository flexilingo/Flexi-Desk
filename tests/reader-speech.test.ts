import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSpeechState, langTag, pickVoice, speak, stop, type VoiceLike } from '@/lib/speech';

const voices: VoiceLike[] = [
  { name: 'Alex', lang: 'en-US', localService: true, default: true },
  { name: 'Google UK English', lang: 'en-GB', localService: false },
  { name: 'Amelie (Premium)', lang: 'fr_CA', localService: true },
  { name: 'Thomas', lang: 'fr-FR', localService: true },
  { name: 'Ting-Ting', lang: 'zh-CN', localService: true },
];

describe('langTag', () => {
  it('maps the app language codes to regional tags and passes others through', () => {
    expect(langTag('en')).toBe('en-US');
    expect(langTag('zh')).toBe('zh-CN');
    expect(langTag(undefined)).toBe('en-US');
    expect(langTag('pt_BR')).toBe('pt-BR');
  });
});

describe('pickVoice', () => {
  it('prefers the exact regional match', () => {
    expect(pickVoice(voices, 'en')?.name).toBe('Alex');
    expect(pickVoice(voices, 'fr')?.name).toBe('Thomas');
  });

  it('falls back to the same language in another region, preferring neural / premium names', () => {
    expect(pickVoice(voices, 'en-AU')?.name).toBe('Alex');
    expect(pickVoice([{ name: 'Amelie (Premium)', lang: 'fr_CA' }, { name: 'Basic', lang: 'fr-BE' }], 'fr')?.name).toBe(
      'Amelie (Premium)',
    );
  });

  it('returns null when nothing speaks the language, so the system decides', () => {
    expect(pickVoice(voices, 'de')).toBeNull();
    expect(pickVoice([], 'en')).toBeNull();
  });
});

describe('speak / stop', () => {
  const spoken: Array<{ text: string; lang: string; voice?: unknown }> = [];
  let last: { onstart?: () => void; onend?: () => void } = {};

  beforeEach(() => {
    spoken.length = 0;
    class Utterance {
      lang = '';
      voice: unknown;
      onstart?: () => void;
      onend?: () => void;
      onerror?: () => void;
      constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        getVoices: () => voices,
        speak: (u: Utterance) => {
          spoken.push({ text: u.text, lang: u.lang, voice: u.voice });
          last = u;
        },
      },
    });
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  it('says the text in the language\'s voice and reports its state', async () => {
    const done = speak('bonjour', 'fr');
    expect(spoken[0]).toMatchObject({ text: 'bonjour', lang: 'fr-FR' });
    expect((spoken[0].voice as VoiceLike).name).toBe('Thomas');
    expect(getSpeechState()).toMatchObject({ loading: true, speaking: false, text: 'bonjour' });
    last.onstart?.();
    expect(getSpeechState()).toMatchObject({ loading: false, speaking: true });
    last.onend?.();
    await done;
    expect(getSpeechState().text).toBeNull();
  });

  it('a new word cuts the previous one off, and a late end of the old one is ignored', async () => {
    void speak('one', 'en');
    const first = last;
    const second = speak('two', 'en');
    first.onend?.();
    expect(getSpeechState().text).toBe('two');
    last.onend?.();
    await second;
    expect(getSpeechState().text).toBeNull();
  });

  it('ignores empty text and stop() clears the state', () => {
    void speak('   ', 'en');
    expect(spoken).toHaveLength(0);
    void speak('hello', 'en');
    stop();
    expect(getSpeechState().text).toBeNull();
  });
});
