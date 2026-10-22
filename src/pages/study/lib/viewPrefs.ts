import { parseBool, serializeBool, usePersistedPreference } from './persistedPreference';

/**
 * How the session LOOKS and which mode it opens in — the website's card-view
 * switches, text size and Normal/Shadowing pick, kept on this computer.
 *
 * (Reverse direction and auto-pronounce are NOT here: they are the study engine's
 * own settings and live in its config, which the Rust side reads when it serves a card.)
 */
export type StudyMode = 'normal' | 'shadowing';
export type StudyTextSizeId = 'compact' | 'comfortable' | 'large' | 'huge';

export const STUDY_TEXT_SIZES: { id: StudyTextSizeId; scale: number }[] = [
  { id: 'compact', scale: 1 },
  { id: 'comfortable', scale: 1.15 },
  { id: 'large', scale: 1.3 },
  { id: 'huge', scale: 1.5 },
];
export const DEFAULT_TEXT_SIZE: StudyTextSizeId = 'large';

/** What the flashcard shows. All default on: every mask is opt-in. */
export interface StudyCardVisibility {
  showWord: boolean;
  showMeaning: boolean;
  showExampleMeanings: boolean;
}
export type StudyVisibilityKey = keyof StudyCardVisibility;
/** Menu order — also the order the switches read as a sentence about the card. */
export const STUDY_VISIBILITY_KEYS: StudyVisibilityKey[] = [
  'showWord',
  'showMeaning',
  'showExampleMeanings',
];

export const VIEW_KEYS = {
  mode: 'flexi.study.mode',
  textSize: 'flexi.study.textSize',
  showWord: 'flexi.study.view.showWord',
  showMeaning: 'flexi.study.view.showMeaning',
  showExampleMeanings: 'flexi.study.view.showExampleMeanings',
  pronounceWordOnReveal: 'flexi.study.view.pronounceWordOnReveal',
  accent: 'flexi.study.accent',
} as const;

export const parseMode = (raw: string): StudyMode | null =>
  raw === 'normal' || raw === 'shadowing' ? raw : null;
export const parseTextSize = (raw: string): StudyTextSizeId | null =>
  STUDY_TEXT_SIZES.some((s) => s.id === raw) ? (raw as StudyTextSizeId) : null;
export const parseAccent = (raw: string): 'us' | 'uk' | null =>
  raw === 'us' || raw === 'uk' ? raw : null;

export const scaleOf = (id: StudyTextSizeId): number =>
  STUDY_TEXT_SIZES.find((s) => s.id === id)?.scale ?? 1;

export function useStudyMode(): [StudyMode, (m: StudyMode) => void] {
  return usePersistedPreference<StudyMode>(VIEW_KEYS.mode, 'normal', parseMode);
}

export function useStudyCardVisibility() {
  const [showWord, setShowWord] = usePersistedPreference(
    VIEW_KEYS.showWord,
    true,
    parseBool,
    serializeBool,
  );
  const [showMeaning, setShowMeaning] = usePersistedPreference(
    VIEW_KEYS.showMeaning,
    true,
    parseBool,
    serializeBool,
  );
  const [showExampleMeanings, setShowExampleMeanings] = usePersistedPreference(
    VIEW_KEYS.showExampleMeanings,
    true,
    parseBool,
    serializeBool,
  );
  const visibility: StudyCardVisibility = { showWord, showMeaning, showExampleMeanings };
  const setVisibility = (key: StudyVisibilityKey, value: boolean) => {
    if (key === 'showWord') setShowWord(value);
    else if (key === 'showMeaning') setShowMeaning(value);
    else setShowExampleMeanings(value);
  };
  return {
    visibility,
    setVisibility,
    toggleVisibility: (key: StudyVisibilityKey) => setVisibility(key, !visibility[key]),
  };
}

export function useStudyReadPrefs() {
  const [textSize, setTextSize] = usePersistedPreference<StudyTextSizeId>(
    VIEW_KEYS.textSize,
    DEFAULT_TEXT_SIZE,
    parseTextSize,
  );
  const [pronounceWordOnReveal, setPronounceWordOnReveal] = usePersistedPreference(
    VIEW_KEYS.pronounceWordOnReveal,
    false,
    parseBool,
    serializeBool,
  );
  const [accent, setAccent] = usePersistedPreference<'us' | 'uk'>(
    VIEW_KEYS.accent,
    'us',
    parseAccent,
  );
  return {
    textSize,
    setTextSize,
    pronounceWordOnReveal,
    setPronounceWordOnReveal,
    accent,
    setAccent,
  };
}
