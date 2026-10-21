import { useSyncExternalStore } from 'react';

/**
 * Speaking a word or a phrase aloud — the ONE place the desk app does it.
 *
 * Today it is the system voice (`window.speechSynthesis`). The website uses a
 * cloud voice for the same job (`useTextToSpeech` + `tts-coordinator`); a later
 * phase puts that stack behind THIS interface, so callers never change:
 *
 *   speak(text, lang)      say it; resolves when it ends (or was cut off), never rejects
 *   stop()                 cut off whatever is being said
 *   getSpeechState()       { speaking, loading, text, lang } — a stable snapshot
 *   subscribeSpeech(fn)    listen for state changes; returns the unsubscribe
 *   useSpeechState()       the same, as a React hook
 *
 * One voice at a time: a new `speak` cuts the previous one off, which is what
 * someone tapping down a line of words wants (the word they are on now, not a
 * backlog).
 */

export interface SpeechState {
  /** Sound is coming out right now. */
  speaking: boolean;
  /** Asked for, not started yet (voice still being chosen / fetched). */
  loading: boolean;
  /** What is being said (or about to be); null when idle. */
  text: string | null;
  lang: string | null;
}

const IDLE: SpeechState = { speaking: false, loading: false, text: null, lang: null };

/** BCP-47 tag per language code the app knows; anything else is passed through. */
const LANG_TAGS: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  ru: 'ru-RU',
  tr: 'tr-TR',
  ar: 'ar-SA',
  fa: 'fa-IR',
  hi: 'hi-IN',
  zh: 'zh-CN',
};

export function langTag(lang: string | undefined | null): string {
  const code = (lang ?? 'en').trim().replace('_', '-');
  return LANG_TAGS[code.toLowerCase()] ?? code;
}

/** Structurally the part of `SpeechSynthesisVoice` the choice needs. */
export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

const primary = (tag: string) => tag.toLowerCase().replace('_', '-').split('-')[0];

/**
 * The best installed voice for a language, or null when none speaks it (the
 * caller then lets the system pick from `utterance.lang`).
 *
 * An exact regional match beats a same-language one (`fr-FR` over `fr-CA` when
 * `fr-FR` was asked for), then the better-sounding families (neural / natural /
 * premium / enhanced), then voices that live on this machine, then the system
 * default.
 */
export function pickVoice<V extends VoiceLike>(
  voices: readonly V[],
  lang: string | undefined | null,
): V | null {
  const tag = langTag(lang);
  const want = primary(tag);
  let best: V | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const have = voice.lang.replace('_', '-');
    if (primary(have) !== want) continue;
    let score = 1;
    if (have.toLowerCase() === tag.toLowerCase()) score += 100;
    if (/natural|neural|premium|enhanced/i.test(voice.name)) score += 20;
    if (voice.localService) score += 5;
    if (voice.default) score += 1;
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

let state: SpeechState = IDLE;
const listeners = new Set<() => void>();
/** Bumped by every `speak` / `stop`, so a late `onend` of a cut-off voice is ignored. */
let ticket = 0;

function setState(next: SpeechState) {
  state = next;
  for (const listener of listeners) listener();
}

export const getSpeechState = (): SpeechState => state;

export function subscribeSpeech(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSpeechState(): SpeechState {
  return useSyncExternalStore(subscribeSpeech, getSpeechState, () => IDLE);
}

const available = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && !!window.speechSynthesis;

export function stop(): void {
  ticket += 1;
  if (available()) window.speechSynthesis.cancel();
  if (state !== IDLE) setState(IDLE);
}

export function speak(text: string, lang?: string): Promise<void> {
  const clean = text?.trim();
  if (!clean || !available()) return Promise.resolve();

  const mine = ++ticket;
  const synth = window.speechSynthesis;
  synth.cancel();
  setState({ speaking: false, loading: true, text: clean, lang: lang ?? null });

  return new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = langTag(lang);
    const voice = pickVoice(synth.getVoices(), lang);
    if (voice) utterance.voice = voice;

    const finish = () => {
      if (ticket === mine) setState(IDLE);
      resolve();
    };
    utterance.onstart = () => {
      if (ticket === mine)
        setState({ speaking: true, loading: false, text: clean, lang: lang ?? null });
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
  });
}
