/**
 * Whether the live backend knows library series with seasons.
 *
 * The desk ships before the backend does, so nothing about series is assumed: the answers the
 * library already asks for carry the proof. A catalog answer with a `series_list` array, or a
 * book answer with `series_meta` / a `series_season` / `requires_login` field, means the new
 * backend; anything else (an older backend, an error) leaves the library exactly what the
 * website's production library is. The verdict is kept for the session; a positive is final.
 */

let supported: boolean | null = null;
const listeners = new Set<() => void>();

/** Pure check of one catalog or book answer. */
export function answerShowsSeries(answer: unknown): boolean {
  if (!answer || typeof answer !== 'object') return false;
  const a = answer as Record<string, unknown>;
  if (Array.isArray(a.series_list)) return true;
  if ('series_meta' in a) return true;
  const book = a.book as Record<string, unknown> | undefined;
  return (
    !!book && typeof book === 'object' && ('series_season' in book || 'requires_login' in book)
  );
}

/** Record what an answer proves. */
export function noteSeriesSupport(answer: unknown): void {
  const next = answerShowsSeries(answer);
  if (supported === true || supported === next) return;
  supported = next;
  listeners.forEach((l) => l());
}

export const seriesSupported = (): boolean => supported === true;

export function subscribeSeriesSupport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test hook: forget the session verdict. */
export function resetSeriesSupport(): void {
  supported = null;
}
