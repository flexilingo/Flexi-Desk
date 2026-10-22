export const SYNC_INTERVAL_MS = 60_000;
export const MIN_TIME_CHANGE_SECONDS = 30;

export interface StudySnapshot {
  seconds: number;
  clicks: number;
  words: number;
}

/**
 * What to send to `sync-study-time` since the last accepted sync, or null when it is not worth a
 * request (under 30 s and no new clicked/encountered words).
 */
export function nextStudyDelta(
  last: StudySnapshot,
  now: StudySnapshot,
): { deltaTimeSeconds: number; newWordsEncountered: number; newClickedWords: number } | null {
  const dt = now.seconds - last.seconds;
  const dc = now.clicks - last.clicks;
  const dw = now.words - last.words;
  if (dt < MIN_TIME_CHANGE_SECONDS && dc <= 0 && dw <= 0) return null;
  if (dt <= 0 && dc <= 0 && dw <= 0) return null;
  return {
    deltaTimeSeconds: Math.max(0, dt),
    newWordsEncountered: Math.max(0, dw),
    newClickedWords: Math.max(0, dc),
  };
}
