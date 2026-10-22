import { useCallback, useEffect, useRef, useState } from 'react';

export interface Source<T> {
  data: T | null;
  /** True until the first answer (or error) arrives. */
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/**
 * One independent data source of the overview: it loads on mount (and when
 * `enabled` turns on), keeps its last answer while reloading, and reports its
 * own failure — so one broken source breaks one card, not the page.
 */
export function useSource<T>(load: () => Promise<T>, enabled = true): Source<T> {
  const [state, setState] = useState<{ data: T | null; done: boolean; error: boolean }>({
    data: null,
    done: false,
    error: false,
  });
  const loader = useRef(load);
  loader.current = load;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, done: false, error: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, error: false }));
    loader
      .current()
      .then((data) => !cancelled && setState({ data, done: true, error: false }))
      .catch(() => !cancelled && setState((s) => ({ data: s.data, done: true, error: true })));
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  // Derived, so the first render after `enabled` turns on already reads as loading.
  return { data: state.data, error: state.error, loading: enabled && !state.done, reload };
}
