import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

// A tiny cache so Back from a video (and the filter bar's repeated counts) are instant. Keyed by the
// signed-in user too: music rows only exist for a signed-in caller, so signing in must refetch.
const FRESH_MS = 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

export function clearVideoCache(): void {
  cache.clear();
}

interface QueryState<T> {
  key: string | null;
  data?: T;
  error?: unknown;
}

/**
 * Loads one cloud read. `key` null = skip. `currentData` is only ever THIS key's answer; `data` also
 * keeps the previous key's answer on screen while the next one loads (so the filter counts do not blink).
 */
export function useCloudQuery<T>(key: string | null, fetcher: () => Promise<T>) {
  const userId = useAuthStore((s) => s.session?.user_id ?? 'anon');
  const fullKey = key === null ? null : `${userId}|${key}`;
  const [state, setState] = useState<QueryState<T>>(() => {
    const hit = fullKey ? cache.get(fullKey) : undefined;
    return hit ? { key: fullKey, data: hit.data as T } : { key: null };
  });
  const [attempt, setAttempt] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [lastData, setLastData] = useState<T | undefined>(state.data);

  useEffect(() => {
    if (!fullKey) return;
    const hit = cache.get(fullKey);
    if (hit && attempt === 0 && Date.now() - hit.at < FRESH_MS) {
      setState({ key: fullKey, data: hit.data as T });
      setLastData(hit.data as T);
      return;
    }
    let live = true;
    setState((s) => (s.key === fullKey ? { key: fullKey, data: s.data } : { key: null }));
    fetcherRef
      .current()
      .then((data) => {
        cache.set(fullKey, { at: Date.now(), data });
        if (!live) return;
        setState({ key: fullKey, data });
        setLastData(data);
      })
      .catch((error) => {
        if (live) setState({ key: fullKey, error });
      });
    return () => {
      live = false;
    };
  }, [fullKey, attempt]);

  const settled = !!fullKey && state.key === fullKey;
  const currentData = settled ? state.data : undefined;
  const error = settled ? state.error : undefined;
  return {
    data: currentData ?? lastData,
    currentData,
    error,
    /** True while this key's answer has not arrived (and it did not fail). */
    loading: !!fullKey && !(settled && (state.data !== undefined || state.error !== undefined)),
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  };
}
