/**
 * The reading text size, as one preference shared by every reader.
 *
 * ONE key on purpose: a learner who sets the text bigger for an upload means
 * it for the book they open next. Kept out of the components so the stepper,
 * the page body and the persisted value can never disagree about the bounds.
 *
 * The parse/serialize pair is module-level so `usePersistedPreference` keeps a
 * stable `getSnapshot` identity — an inline arrow re-subscribes
 * `useSyncExternalStore` on every render.
 */
export const TEXT_SCALE_KEY = 'flexi.reader.scale';
export const TEXT_SCALE_DEFAULT = 1.05;
export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 1.8;
export const TEXT_SCALE_STEP = 0.1;

export const parseTextScale = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= TEXT_SCALE_MIN && n <= TEXT_SCALE_MAX ? n : null;
};

export const serializeTextScale = (n: number) => String(n);

/**
 * One step bigger or smaller, clamped.
 *
 * Rounded on purpose: 1.05 + 0.1 is 1.1500000000000001 in binary floating
 * point, and that is the string that would be written to storage and read back
 * on every visit. The ladder has one decimal, so the value should too.
 */
export const stepTextScale = (scale: number, direction: 1 | -1): number => {
  const next = Math.round((scale + direction * TEXT_SCALE_STEP) * 100) / 100;
  return Math.min(Math.max(next, TEXT_SCALE_MIN), TEXT_SCALE_MAX);
};
