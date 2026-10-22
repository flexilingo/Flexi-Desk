import { useCallback, useState } from 'react';

/**
 * A preference kept in `localStorage`: read once on mount, written on every change. A value
 * that does not parse (or storage that is unavailable) falls back to the default; the
 * in-memory choice still applies when a write fails.
 */
export function usePersistedPreference<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | null,
  serialize: (value: T) => string = String,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw === null ? null : parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, serialize(next));
      } catch {
        /* quota or no storage */
      }
    },
    [key, serialize],
  );
  return [value, set];
}
