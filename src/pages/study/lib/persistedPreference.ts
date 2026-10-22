import { useCallback, useSyncExternalStore } from 'react';

/**
 * A small preference (a playback setting, a card view) kept on this computer.
 *
 * Backed by localStorage but NOT dependent on it: when `setItem` throws, every
 * write still lands in this module-level map, which is what the UI reads back, so
 * the control keeps working for the session. Persistence is the part that degrades.
 */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    // Another window wrote this key: its value is the truth now.
    if (event.key) memory.delete(event.key);
    else memory.clear();
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readRaw(key: string): string | null {
  const shadowed = memory.get(key);
  if (shadowed !== undefined) return shadowed;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted; the value still applies for this session.
  }
  emit();
}

/** Forgets the in-memory copy of a key (tests; a stored value then wins again). */
export function forgetPreference(key: string) {
  memory.delete(key);
  emit();
}

/** The stored value for `key`, parsed, or the fallback. Non-React readers use this. */
export function readPreference<T>(key: string, fallback: T, parse: (raw: string) => T | null): T {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  return parse(raw) ?? fallback;
}

/**
 * `parse` must return a primitive (or null to fall back): `useSyncExternalStore`
 * compares snapshots by identity, so a freshly built object would re-render forever.
 */
export function usePersistedPreference<T extends string | number | boolean>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | null,
  serialize: (value: T) => string = String,
): [T, (value: T) => void] {
  const getSnapshot = useCallback(
    (): T => readPreference<T>(key, fallback, parse),
    [key, fallback, parse],
  );
  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  const set = useCallback((next: T) => writeRaw(key, serialize(next)), [key, serialize]);
  return [value, set];
}

export const parseBool = (raw: string): boolean | null =>
  raw === '1' || raw === '0' ? raw === '1' : null;
export const serializeBool = (value: boolean): string => (value ? '1' : '0');
