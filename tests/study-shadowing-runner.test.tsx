import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import en from '../src/i18n/locales/en/study.json';
import { forgetPreference } from '../src/pages/study/lib/persistedPreference';
import { KEYS } from '../src/pages/study/lib/shadowingPrefs';

// A voice that speaks until the test says it has ended — the audio, not a timer, drives the run.
const voice = vi.hoisted(() => ({
  calls: [] as { text: string; lang: string; end: () => void }[],
}));
vi.mock('@/lib/speech', () => ({
  speak: (text: string, lang: string) =>
    new Promise<void>((resolve) => {
      voice.calls.push({ text, lang, end: resolve });
    }),
  stop: () => {
    const open = voice.calls.filter((c) => !('done' in c));
    open.forEach((c) => c.end());
  },
  useSpeechState: () => ({ speaking: false, loading: false, text: null, lang: null }),
}));

const cards = vi.hoisted(() => [
  { card_id: 'c1', deck_id: 'd', front_text: 'bonjour', back_text: 'hello', notes: null, language: 'fr', native_language: 'en' },
  { card_id: 'c2', deck_id: 'd', front_text: 'merci', back_text: 'thank you', notes: null, language: 'fr', native_language: 'en' },
]);
const report = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
vi.mock('../src/pages/study/stores/studyStore', () => ({
  fetchSessionCards: vi.fn(() => Promise.resolve(cards)),
  reportShadowProgress: report,
}));
vi.mock('../src/pages/study/lib/audioKeepAlive', () => ({ useAudioKeepAlive: () => {} }));

import { ShadowingRunner } from '../src/pages/study/components/ShadowingRunner';

const mount = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <ShadowingRunner sessionId="s1" nativeLanguage="en" accent="us" onAccentChange={() => {}} focusMode={false} />
    </I18nextProvider>,
  );
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const word = () => screen.queryByTestId('shadow-word')?.textContent;

describe('<ShadowingRunner>: the card changes when the sound ends, after the pause the learner set', () => {
  beforeEach(async () => {
    // The settings sliders measure themselves; jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    voice.calls.length = 0;
    localStorage.clear();
    Object.values(KEYS).forEach(forgetPreference);
    // One word per turn, a 1.3 s pause (a FRACTION of a second), hands-free.
    localStorage.setItem(KEYS.gap, '1300');
    localStorage.setItem(KEYS.repeatEach, '1');
    if (!i18n.isInitialized) await i18n.init({ lng: 'en', resources: { en: { study: en } }, interpolation: { escapeValue: false } });
    else i18n.addResourceBundle('en', 'study', en, true, true);
    await i18n.changeLanguage('en');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for the voice however long it takes, then for exactly 1.3 s, then moves on', async () => {
    mount();
    await tick(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await tick(0);
    expect(word()).toBe('bonjour');
    expect(voice.calls.map((c) => [c.text, c.lang])).toEqual([['bonjour', 'fr']]); // read in the deck's language

    // A very long word: ten seconds go by and nothing moves — it is not a timer.
    await tick(10_000);
    expect(word()).toBe('bonjour');
    expect(voice.calls).toHaveLength(1);

    // The sound ends. The pause now begins; 1299 ms later the card is still the same...
    await act(async () => voice.calls[0].end());
    await tick(1299);
    expect(word()).toBe('bonjour');
    expect(voice.calls).toHaveLength(1);
    // ...and 1 ms after that, 1.3 s have passed: the next word arrives and is spoken.
    await tick(1);
    expect(word()).toBe('merci');
    expect(voice.calls.map((c) => c.text)).toEqual(['bonjour', 'merci']);
  });

  it('the recall pause keeps the meaning covered until it is over, then shows it', async () => {
    localStorage.setItem(KEYS.meaning, 'after');
    mount();
    await tick(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await tick(0);
    expect(screen.queryByTestId('shadow-meaning')).toBeNull();
    await act(async () => voice.calls[0].end());
    await tick(500);
    expect(screen.queryByTestId('shadow-meaning')).toBeNull(); // still recalling
    await tick(900);
    expect(screen.getByTestId('shadow-meaning').textContent).toBe('hello');
  });

  it('hides the word on an audio-only run, and reads the meaning aloud in its own language when asked', async () => {
    localStorage.setItem(KEYS.showWord, '0');
    localStorage.setItem(KEYS.speakMeaning, '1');
    mount();
    await tick(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await tick(0);
    expect(word()).toBeUndefined();
    expect(screen.getByLabelText('Word hidden')).toBeInTheDocument();
    await act(async () => voice.calls[0].end());
    await tick(1300);
    expect(voice.calls.map((c) => [c.text, c.lang])).toEqual([
      ['bonjour', 'fr'],
      ['hello', 'en'],
    ]);
  });

  it('reports what was heard and the seconds that actually played when the run stops', async () => {
    mount();
    await tick(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await tick(0);
    await tick(3000);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await tick(0);
    expect(report).toHaveBeenCalled();
    const last = (report.mock.calls as unknown as [{ session_id: string; card_ids: string[]; played_seconds: number }][]).at(-1)![0];
    expect(last.session_id).toBe('s1');
    expect(last.card_ids).toEqual(['c1']);
    expect(last.played_seconds).toBeGreaterThanOrEqual(3);
  });
});
