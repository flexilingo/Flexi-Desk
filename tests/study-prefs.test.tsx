import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_GAP_MS,
  DEFAULT_SIZE,
  formatGapSeconds,
  GAP_MAX_MS,
  KEYS,
  parseGap,
  parseRepeatEach,
  parseRounds,
  parseSize,
  useShadowingPrefs,
} from '../src/pages/study/lib/shadowingPrefs';
import {
  parseMode,
  useStudyCardVisibility,
  useStudyMode,
  useStudyReadPrefs,
  VIEW_KEYS,
} from '../src/pages/study/lib/viewPrefs';
import { forgetPreference } from '../src/pages/study/lib/persistedPreference';

const ALL_KEYS = [...Object.values(KEYS), ...Object.values(VIEW_KEYS)];
const reset = () => {
  localStorage.clear();
  ALL_KEYS.forEach(forgetPreference);
};

describe('shadowing preferences', () => {
  beforeEach(reset);
  afterEach(reset);

  it('start from the website defaults: 50 words, a 2.5 s pause, twice per word, one round, hands-free', () => {
    const { result } = renderHook(() => useShadowingPrefs());
    expect(result.current.size).toBe(DEFAULT_SIZE);
    expect(result.current.size).toBe(50);
    expect(result.current.gapMs).toBe(DEFAULT_GAP_MS);
    expect(result.current.repeatEach).toBe(2);
    expect(result.current.rounds).toBe(1);
    expect(result.current.autoAdvance).toBe(true);
    expect(result.current.meaning).toBe('always');
    expect(result.current.showWord).toBe(true);
    expect(result.current.speakMeaning).toBe(false);
  });

  it('are kept on this computer: a change survives a remount and lands in storage', () => {
    const first = renderHook(() => useShadowingPrefs());
    act(() => {
      first.result.current.setGapMs(1300);
      first.result.current.setSize(0); // 0 = all
      first.result.current.setMeaning('after');
      first.result.current.setRepeatEach(7);
      first.result.current.setRounds(0);
      first.result.current.setShuffle(true);
      first.result.current.setAutoAdvance(false);
      first.result.current.setSpeakMeaning(true);
    });
    first.unmount();
    expect(localStorage.getItem(KEYS.gap)).toBe('1300');
    ALL_KEYS.forEach(forgetPreference); // as after a restart: only storage remains
    const again = renderHook(() => useShadowingPrefs());
    expect(again.result.current).toMatchObject({
      gapMs: 1300,
      size: 0,
      meaning: 'after',
      repeatEach: 7,
      rounds: 0,
      shuffle: true,
      autoAdvance: false,
      speakMeaning: true,
    });
  });

  it('two screens see the same value at once (the start card and the session menu)', () => {
    const a = renderHook(() => useShadowingPrefs());
    const b = renderHook(() => useShadowingPrefs());
    act(() => a.result.current.setGapMs(4200));
    expect(b.result.current.gapMs).toBe(4200);
  });

  it('the pause keeps fractions of a second, in range, and ignores junk', () => {
    expect(parseGap('1300')).toBe(1300);
    expect(parseGap('1340')).toBe(1340); // not forced to a whole second, nor to a coarse step
    expect(parseGap('2750')).toBe(2750);
    expect(parseGap('0')).toBe(0);
    expect(parseGap(String(GAP_MAX_MS))).toBe(GAP_MAX_MS);
    expect(parseGap(String(GAP_MAX_MS + 1))).toBeNull();
    expect(parseGap('-5')).toBeNull();
    expect(parseGap('abc')).toBeNull();
    expect(parseGap('')).toBeNull();
    expect(formatGapSeconds(1300)).toBe('1.3 s');
    expect(formatGapSeconds(3000)).toBe('3 s');
    expect(formatGapSeconds(2750)).toBe('2.75 s');
  });

  it('only real choices are accepted: sizes, rounds, repeat counts', () => {
    expect(parseSize('0')).toBe(0);
    expect(parseSize('100')).toBe(100);
    expect(parseSize('77')).toBeNull();
    expect(parseRounds('0')).toBe(0);
    expect(parseRounds('4')).toBeNull();
    expect(parseRepeatEach('10')).toBe(10);
    expect(parseRepeatEach('11')).toBeNull();
    expect(parseRepeatEach('1.5')).toBeNull();
  });

  it('a garbled stored value falls back to the default instead of breaking the screen', () => {
    localStorage.setItem(KEYS.gap, 'nonsense');
    localStorage.setItem(KEYS.size, '77');
    const { result } = renderHook(() => useShadowingPrefs());
    expect(result.current.gapMs).toBe(DEFAULT_GAP_MS);
    expect(result.current.size).toBe(DEFAULT_SIZE);
  });
});

describe('card view and mode preferences', () => {
  beforeEach(reset);
  afterEach(reset);

  it('every mask is opt-in: word, meaning and example meanings all start on', () => {
    const { result } = renderHook(() => useStudyCardVisibility());
    expect(result.current.visibility).toEqual({ showWord: true, showMeaning: true, showExampleMeanings: true });
  });

  it('a switch is saved and toggles', () => {
    const { result } = renderHook(() => useStudyCardVisibility());
    act(() => result.current.setVisibility('showMeaning', false));
    expect(result.current.visibility.showMeaning).toBe(false);
    expect(localStorage.getItem(VIEW_KEYS.showMeaning)).toBe('0');
    act(() => result.current.toggleVisibility('showMeaning'));
    expect(result.current.visibility.showMeaning).toBe(true);
  });

  it('the mode, text size, accent and read-on-flip are remembered', () => {
    const mode = renderHook(() => useStudyMode());
    expect(mode.result.current[0]).toBe('normal');
    act(() => mode.result.current[1]('shadowing'));
    expect(localStorage.getItem(VIEW_KEYS.mode)).toBe('shadowing');
    expect(parseMode('shadowing')).toBe('shadowing');
    expect(parseMode('auto')).toBeNull();

    const read = renderHook(() => useStudyReadPrefs());
    expect(read.result.current.textSize).toBe('large');
    expect(read.result.current.accent).toBe('us');
    expect(read.result.current.pronounceWordOnReveal).toBe(false);
    act(() => {
      read.result.current.setTextSize('huge');
      read.result.current.setAccent('uk');
      read.result.current.setPronounceWordOnReveal(true);
    });
    expect(read.result.current).toMatchObject({ textSize: 'huge', accent: 'uk', pronounceWordOnReveal: true });
  });
});
