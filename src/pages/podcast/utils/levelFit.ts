import type { CefrLevel } from '../types';

/** Words per minute at which speech stops being slow, and starts being fast. */
export const SLOW_WPM = 130;
export const FAST_WPM = 160;

/** Which `fitSpeed*` line describes this pace (null when unknown). */
export function fitSpeedKey(
  wpm: number | null | undefined,
): 'fitSpeedSlow' | 'fitSpeedNatural' | 'fitSpeedFast' | null {
  if (wpm == null) return null;
  return wpm < SLOW_WPM ? 'fitSpeedSlow' : wpm <= FAST_WPM ? 'fitSpeedNatural' : 'fitSpeedFast';
}

export interface FitShare {
  level: CefrLevel;
  value: number;
}

const ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Transcribed episodes per level, only the levels that occur, easiest first. Null when none has a band. */
export function showShares(bands: (CefrLevel | null | undefined)[]): FitShare[] | null {
  const counts = new Map<CefrLevel, number>();
  for (const b of bands) if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  const shares = ORDER.filter((l) => counts.has(l)).map((level) => ({
    level,
    value: counts.get(level) ?? 0,
  }));
  return shares.length ? shares : null;
}

/** The level holding the most episodes, and its rounded percentage of the whole. */
export function topShare(shares: FitShare[] | null): { level: CefrLevel; percent: number } | null {
  if (!shares) return null;
  const total = shares.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  const top = shares.reduce((a, b) => (b.value > a.value ? b : a));
  return { level: top.level, percent: Math.round((top.value / total) * 100) };
}

/** Whether a failed episode failed because its language is not supported (shown as its own note). */
export const isUnsupportedLanguage = (errorMessage: string | null | undefined): boolean =>
  !!errorMessage?.startsWith('UNSUPPORTED_LANGUAGE');
