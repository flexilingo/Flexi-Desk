import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '@/stores/authStore';
import { chunkText, cloudPaths } from '@/lib/speechVoices';

/**
 * Speaking a word or a phrase aloud — the ONE place the desk app does it.
 *
 * The website's voice stack, behind one interface. Engines, in order (see
 * `planEngines`):
 *   cloud    Microsoft's natural voice from `text-to-speech-v2` (then our own
 *            voice), signed in only; fetched through Rust (it needs the bearer
 *            token) and played in an <audio> element
 *   device   the best installed `speechSynthesis` voice for the language (Windows
 *            ships system voices, so this works with no install)
 *   system   Rust `tutor_speak_text` (OpenAI key, or macOS `say`) — last resort
 * If an engine fails, the next one speaks.
 *
 *   speak(text, lang, opts?)  say it; resolves when it ends (or was cut off), never rejects
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
/** Cuts off whatever engine is making sound right now. */
let cancelCurrent: (() => void) | null = null;
let systemActive = false;

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

// -- Engine choice -----------------------------------------------------------

export type SpeechEngine = 'cloud' | 'device' | 'system';
export type SpeechPreference = 'auto' | SpeechEngine;

export interface SpeechEnv {
  signedIn: boolean;
  deviceAvailable: boolean;
  /** An installed device voice speaks the language (true while voices are still loading). */
  deviceHasVoice: boolean;
  /** The Rust fallback exists (running inside the desktop app). */
  systemAvailable: boolean;
}

/**
 * The engines to try, in order. Automatic order: cloud (signed in) -> device
 * voice for the language -> Rust system voice -> device voice that does not
 * speak the language (the system picks something). A chosen engine goes first.
 */
export function planEngines(env: SpeechEnv, preference: SpeechPreference = 'auto'): SpeechEngine[] {
  const auto: SpeechEngine[] = [];
  if (env.signedIn) auto.push('cloud');
  if (env.deviceAvailable && env.deviceHasVoice) auto.push('device');
  if (env.systemAvailable) auto.push('system');
  if (env.deviceAvailable && !env.deviceHasVoice) auto.push('device');
  if (preference === 'auto' || !auto.includes(preference)) return auto;
  return [preference, ...auto.filter((e) => e !== preference)];
}

const PREF_KEY = 'flexi.speech.engine';
const prefListeners = new Set<() => void>();
let preference: SpeechPreference | null = null;

const isPreference = (v: unknown): v is SpeechPreference =>
  v === 'auto' || v === 'cloud' || v === 'device' || v === 'system';

export function getSpeechPreference(): SpeechPreference {
  if (preference === null) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(PREF_KEY);
    } catch {
      // storage unavailable: automatic order
    }
    preference = isPreference(saved) ? saved : 'auto';
  }
  return preference;
}

export function setSpeechPreference(next: SpeechPreference): void {
  preference = next;
  try {
    localStorage.setItem(PREF_KEY, next);
  } catch {
    // not persisted; still applies this session
  }
  for (const listener of prefListeners) listener();
}

const ACCENT_KEY = 'flexi.speech.accent';

/** The English accent the learner picked in Settings (American unless they chose British). */
export function getSpeechAccent(): 'us' | 'uk' {
  try {
    return localStorage.getItem(ACCENT_KEY) === 'uk' ? 'uk' : 'us';
  } catch {
    return 'us';
  }
}

export function setSpeechAccent(next: 'us' | 'uk'): void {
  try {
    localStorage.setItem(ACCENT_KEY, next);
  } catch {
    // not persisted; the next sample still uses it through `opts.accent`
  }
}

/** The saved engine choice as a React hook: `[preference, setPreference]`. */
export function useSpeechPreference(): [SpeechPreference, (next: SpeechPreference) => void] {
  const value = useSyncExternalStore(
    (fn) => {
      prefListeners.add(fn);
      return () => prefListeners.delete(fn);
    },
    getSpeechPreference,
    () => 'auto' as SpeechPreference,
  );
  return [value, setSpeechPreference];
}

const deviceAvailable = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && !!window.speechSynthesis;

const inDesktopApp = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function currentEnv(lang: string | undefined): SpeechEnv {
  const device = deviceAvailable();
  const voices = device ? window.speechSynthesis.getVoices() : [];
  return {
    signedIn: !!useAuthStore.getState().session,
    deviceAvailable: device,
    deviceHasVoice: device && (voices.length === 0 || pickVoice(voices, lang) !== null),
    systemAvailable: inDesktopApp(),
  };
}

/** Engines that can speak right now (for a settings screen). */
export function availableEngines(lang?: string): SpeechEngine[] {
  const env = currentEnv(lang);
  const all: SpeechEngine[] = [];
  if (env.signedIn) all.push('cloud');
  if (env.deviceAvailable) all.push('device');
  if (env.systemAvailable) all.push('system');
  return all;
}

// -- Engines -----------------------------------------------------------------

type Outcome = 'done' | 'failed';

export interface SpeakOptions {
  /** English accent: 'us' (default) or 'uk'. */
  accent?: 'us' | 'uk';
  /** Try exactly these engines, in this order (a settings sample). */
  engines?: SpeechEngine[];
}

const CLOUD_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function fetchClip(
  text: string,
  lang: string | undefined,
  accent?: string,
): Promise<Blob | null> {
  for (const path of cloudPaths(text, lang, accent)) {
    try {
      const raw = await withTimeout(
        invoke<ArrayBuffer>('supabase_fetch_bytes', { path }),
        CLOUD_TIMEOUT_MS,
      );
      const bytes =
        raw instanceof ArrayBuffer ? raw : new Uint8Array(raw as ArrayLike<number>).buffer;
      if (bytes.byteLength === 0) continue;
      const head = new Uint8Array(bytes.slice(0, 4));
      const wav = String.fromCharCode(...head) === 'RIFF';
      return new Blob([bytes], { type: wav ? 'audio/wav' : 'audio/mpeg' });
    } catch {
      // next voice
    }
  }
  return null;
}

function playBlob(
  blob: Blob,
  mine: number,
  text: string,
  lang: string | undefined,
): Promise<Outcome> {
  return new Promise<Outcome>((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const end = (outcome: Outcome) => {
      if (cancelCurrent === cancel) cancelCurrent = null;
      audio.onplaying = audio.onended = audio.onerror = null;
      URL.revokeObjectURL(url);
      resolve(outcome);
    };
    const cancel = () => {
      audio.pause();
      end('done');
    };
    cancelCurrent = cancel;
    audio.onplaying = () => {
      if (ticket === mine) setState({ speaking: true, loading: false, text, lang: lang ?? null });
    };
    audio.onended = () => end('done');
    audio.onerror = () => end('failed');
    audio.play().catch(() => end('failed'));
  });
}

async function runCloud(
  text: string,
  lang: string | undefined,
  opts: SpeakOptions,
  mine: number,
): Promise<Outcome> {
  const chunks = chunkText(text);
  for (let i = 0; i < chunks.length; i++) {
    const clip = await fetchClip(chunks[i], lang, opts.accent);
    if (ticket !== mine) return 'done';
    // A failure after sound has started must not replay the start on the next engine.
    if (!clip) return i === 0 ? 'failed' : 'done';
    if ((await playBlob(clip, mine, text, lang)) === 'failed') return i === 0 ? 'failed' : 'done';
    if (ticket !== mine) return 'done';
  }
  return 'done';
}

function runDevice(text: string, lang: string | undefined, mine: number): Promise<Outcome> {
  return new Promise<Outcome>((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langTag(lang);
    const voice = pickVoice(synth.getVoices(), lang);
    if (voice) utterance.voice = voice;
    const end = (outcome: Outcome) => {
      if (cancelCurrent === cancel) cancelCurrent = null;
      resolve(outcome);
    };
    const cancel = () => end('done');
    cancelCurrent = cancel;
    utterance.onstart = () => {
      if (ticket === mine) setState({ speaking: true, loading: false, text, lang: lang ?? null });
    };
    utterance.onend = () => end('done');
    utterance.onerror = (e) => {
      const reason = (e as { error?: string } | undefined)?.error;
      end(reason === 'canceled' || reason === 'interrupted' ? 'done' : 'failed');
    };
    synth.speak(utterance);
  });
}

async function runSystem(text: string, lang: string | undefined, mine: number): Promise<Outcome> {
  systemActive = true;
  if (ticket === mine) setState({ speaking: true, loading: false, text, lang: lang ?? null });
  try {
    await invoke('tutor_speak_text', { text, language: lang ? baseLangCode(lang) : null });
    return 'done';
  } catch {
    return 'failed';
  } finally {
    if (ticket === mine) systemActive = false;
  }
}

const baseLangCode = (lang: string) => lang.trim().replace('_', '-').split('-')[0].toLowerCase();

async function runPlan(
  plan: SpeechEngine[],
  text: string,
  lang: string | undefined,
  opts: SpeakOptions,
  mine: number,
): Promise<void> {
  for (const engine of plan) {
    if (ticket !== mine) return;
    const outcome =
      engine === 'cloud'
        ? await runCloud(text, lang, opts, mine)
        : engine === 'device'
          ? await runDevice(text, lang, mine)
          : await runSystem(text, lang, mine);
    if (outcome === 'done' || ticket !== mine) return;
  }
}

export function stop(): void {
  ticket += 1;
  const cancel = cancelCurrent;
  cancelCurrent = null;
  cancel?.();
  if (deviceAvailable()) window.speechSynthesis.cancel();
  if (systemActive) {
    systemActive = false;
    invoke('tutor_stop_speaking').catch(() => {});
  }
  if (state !== IDLE) setState(IDLE);
}

export function speak(text: string, lang?: string, opts: SpeakOptions = {}): Promise<void> {
  const clean = text?.trim();
  if (!clean) return Promise.resolve();
  const plan = opts.engines ?? planEngines(currentEnv(lang), getSpeechPreference());
  if (plan.length === 0) return Promise.resolve();

  stop();
  const mine = ticket;
  setState({ speaking: false, loading: true, text: clean, lang: lang ?? null });

  return runPlan(plan, clean, lang, { ...opts, accent: opts.accent ?? getSpeechAccent() }, mine)
    .catch(() => {})
    .then(() => {
      if (ticket === mine) setState(IDLE);
    });
}

/** How one `speakThrough` ended. */
export type SpeakOutcome = 'ended' | 'cut' | 'unavailable';

/**
 * `speak`, for a reader that chains pieces: says whether the piece ran to its end, was cut
 * off (by `stop` or by anything else speaking — one voice at a time), or never made a sound
 * (no engine could say it). A chain goes on only after 'ended'.
 */
export async function speakThrough(
  text: string,
  lang?: string,
  opts: SpeakOptions = {},
): Promise<SpeakOutcome> {
  const clean = text?.trim();
  if (!clean) return 'ended';
  const plan = opts.engines ?? planEngines(currentEnv(lang), getSpeechPreference());
  if (plan.length === 0) return 'unavailable';
  const done = speak(clean, lang, { ...opts, engines: plan });
  // `speak` has taken its ticket synchronously: any later speak or stop moves it on.
  const mine = ticket;
  // The system voice reports itself speaking before `speak` even returns.
  let sounded = state.speaking;
  const off = subscribeSpeech(() => {
    if (ticket === mine && state.speaking) sounded = true;
  });
  try {
    await done;
  } finally {
    off();
  }
  if (ticket !== mine) return 'cut';
  return sounded ? 'ended' : 'unavailable';
}
