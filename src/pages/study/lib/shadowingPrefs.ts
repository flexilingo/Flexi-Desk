import { parseBool, serializeBool, usePersistedPreference } from './persistedPreference';

/**
 * Shadowing's settings, per computer — the website's `useShadowingPrefs`, with one
 * deliberate difference: the pause is a real number of seconds, not a whole one.
 * The pause is the exercise (it is when the learner says the word back), a long
 * sentence wants 3.4 s and a short word 1.3 s, so it is stored in milliseconds
 * and accepted at 10 ms resolution rather than rounded to a coarse step.
 */
export const GAP_MIN_MS = 0;
export const GAP_MAX_MS = 10_000;
/** The slider's step. The number box beside it accepts any value in between. */
export const GAP_STEP_MS = 100;
/** Long by default: this gap IS the practice. */
export const DEFAULT_GAP_MS = 2500;

/** The usual counts get a chip; "+" and "-" step past them, up to the max. */
export const REPEAT_EACH_CHOICES: readonly number[] = [1, 2, 3];
export const REPEAT_EACH_MAX = 10;
export const REPEAT_EACH_DEFAULT = 2;
export const ROUND_CHOICES = [1, 2, 3, 5, 0] as const;
/** Words per run. `0` means "everything the session has". */
export const SIZE_CHOICES = [25, 50, 100, 0] as const;
/** Fifty is a session you finish; a drill nobody reaches the end of never feels done. */
export const DEFAULT_SIZE = 50;

export const KEYS = {
  gap: 'flexi.study.shadow.gap',
  repeatEach: 'flexi.study.shadow.repeatEach',
  rounds: 'flexi.study.shadow.rounds',
  shuffle: 'flexi.study.shadow.shuffle',
  speakMeaning: 'flexi.study.shadow.speakMeaning',
  autoAdvance: 'flexi.study.shadow.autoAdvance',
  size: 'flexi.study.shadow.size',
  meaning: 'flexi.study.shadow.meaning',
  showWord: 'flexi.study.shadow.showWord',
} as const;

/**
 * How a shadowing card shows the meaning: with the word, once the recall pause is
 * over, or not at all. One three-way choice, not two switches.
 */
export type ShadowingMeaning = 'always' | 'after' | 'hidden';
export const MEANING_CHOICES: readonly ShadowingMeaning[] = ['always', 'after', 'hidden'];

/** Any finite value in range, kept to 10 ms — 1.3 s stays 1.3 s. */
export const parseGap = (raw: string): number | null => {
  const v = Number(raw);
  return raw.trim() !== '' && Number.isFinite(v) && v >= GAP_MIN_MS && v <= GAP_MAX_MS
    ? Math.round(v / 10) * 10
    : null;
};
const parseFrom = (choices: readonly number[]) => (raw: string) => {
  const v = Number(raw);
  return choices.includes(v) ? v : null;
};
export const parseSize = parseFrom(SIZE_CHOICES);
export const parseRounds = parseFrom(ROUND_CHOICES);
export const parseMeaning = (raw: string): ShadowingMeaning | null =>
  (MEANING_CHOICES as readonly string[]).includes(raw) ? (raw as ShadowingMeaning) : null;
export const parseRepeatEach = (raw: string): number | null => {
  const v = Number(raw);
  return Number.isInteger(v) && v >= 1 && v <= REPEAT_EACH_MAX ? v : null;
};

/** Seconds as the learner reads them: "1.3 s", "2.5 s", "3 s". */
export const formatGapSeconds = (ms: number): string => `${Number((ms / 1000).toFixed(2))} s`;

export function useShadowingPrefs() {
  const [size, setSize] = usePersistedPreference(KEYS.size, DEFAULT_SIZE, parseSize);
  const [gapMs, setGapMs] = usePersistedPreference(KEYS.gap, DEFAULT_GAP_MS, parseGap);
  const [repeatEach, setRepeatEach] = usePersistedPreference(
    KEYS.repeatEach,
    REPEAT_EACH_DEFAULT,
    parseRepeatEach,
  );
  const [rounds, setRounds] = usePersistedPreference(KEYS.rounds, 1, parseRounds);
  const [shuffle, setShuffle] = usePersistedPreference(
    KEYS.shuffle,
    false,
    parseBool,
    serializeBool,
  );
  const [speakMeaning, setSpeakMeaning] = usePersistedPreference(
    KEYS.speakMeaning,
    false,
    parseBool,
    serializeBool,
  );
  /** Whether the run moves on by itself. On by default — that is what this mode does. */
  const [autoAdvance, setAutoAdvance] = usePersistedPreference(
    KEYS.autoAdvance,
    true,
    parseBool,
    serializeBool,
  );
  const [meaning, setMeaning] = usePersistedPreference<ShadowingMeaning>(
    KEYS.meaning,
    'always',
    parseMeaning,
  );
  const [showWord, setShowWord] = usePersistedPreference(
    KEYS.showWord,
    true,
    parseBool,
    serializeBool,
  );

  return {
    size,
    setSize,
    gapMs,
    setGapMs,
    repeatEach,
    setRepeatEach,
    rounds,
    setRounds,
    shuffle,
    setShuffle,
    speakMeaning,
    setSpeakMeaning,
    autoAdvance,
    setAutoAdvance,
    meaning,
    setMeaning,
    showWord,
    setShowWord,
  };
}

export type ShadowingPrefs = ReturnType<typeof useShadowingPrefs>;
