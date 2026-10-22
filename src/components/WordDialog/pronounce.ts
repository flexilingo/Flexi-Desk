import { useCallback, useSyncExternalStore } from 'react';
import { speak, stop, useSpeechState } from '@/lib/speech';
import { REGIONAL_VOICES } from './logic';

/**
 * Pronunciation preferences of the word dialog, kept on this machine:
 * auto-pronounce when a word opens, and the learner's own voice region per
 * language (fr-CA, en-GB ...). Every pick is broadcast so open dialogs follow.
 */
const AUTO_KEY = 'flexi.wordDialog.autoPronounce';
const VOICES_KEY = 'flexi.wordDialog.voices';
const CHANGED = 'flexi:pronunciation-settings';

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* kept in this session only */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export const readAutoPronounce = (): boolean => readStore(AUTO_KEY) === '1';

export function readVoices(): Record<string, string> {
  try {
    const parsed = JSON.parse(readStore(VOICES_KEY) ?? '{}') as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** The learner's own region for `language`, when it is one the language really has. */
export function voiceFor(language: string): string | null {
  const own = readVoices()[language];
  return own && REGIONAL_VOICES[language]?.includes(own) ? own : null;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Raw snapshot of both settings; parsed by the hook. */
const snapshot = () => `${readStore(AUTO_KEY) ?? ''}|${readStore(VOICES_KEY) ?? ''}`;

export function usePronunciationSettings() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '|');
  const autoPronounce = raw.startsWith('1|');
  const setAutoPronounce = useCallback((on: boolean) => writeStore(AUTO_KEY, on ? '1' : '0'), []);
  const setVoice = useCallback((language: string, voice: string) => {
    writeStore(VOICES_KEY, JSON.stringify({ ...readVoices(), [language]: voice }));
  }, []);
  return { autoPronounce, setAutoPronounce, setVoice };
}

/**
 * Say `text` in the WORD'S language. `voice` is a BCP-47 region tag (fr-CA,
 * en-GB) and is passed as the language, which speech.ts reads as "this region
 * if a voice for it exists, else the language".
 */
export function pronounce(text: string, language: string, voice?: string | null): Promise<void> {
  return speak(text, voice || voiceFor(language) || language);
}

export { stop as stopPronouncing, useSpeechState };

/** State of one button: is THIS text (in this voice) loading or playing right now. */
export function useSpeakerState(text: string, tag: string): { loading: boolean; playing: boolean } {
  const s = useSpeechState();
  const mine = s.text === text.trim() && s.lang === tag;
  return { loading: mine && s.loading, playing: mine && s.speaking };
}
