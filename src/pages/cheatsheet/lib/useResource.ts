import { useCallback, useEffect, useRef, useState } from 'react';
import { cheatsheet } from './service';
import { CheatsheetUnavailableError } from './client';

export type Resource<T> = {
  data: T | undefined;
  loading: boolean;
  error: 'offline' | 'failed' | null;
  /** Re-runs the load (the retry button). */
  reload: () => void;
};

/**
 * Loads something through the cheatsheet client. Reloads when its inputs change
 * and when a background refresh replaced the stored copy of anything (the new
 * answer is then read from the store, instantly).
 */
export function useResource<T>(load: () => Promise<T>, deps: unknown[]): Resource<T> {
  const [state, setState] = useState<{
    data: T | undefined;
    loading: boolean;
    error: Resource<T>['error'];
  }>({
    data: undefined,
    loading: true,
    error: null,
  });
  const loader = useRef(load);
  loader.current = load;
  const lastKey = useRef('');
  const [tick, setTick] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => cheatsheet.onRefresh(() => setRefreshTick((n) => n + 1)), []);

  useEffect(() => {
    let live = true;
    // A background refresh keeps what is on screen; a new input or a retry blanks it.
    const key = JSON.stringify(deps);
    const sameInputs = lastKey.current === key;
    lastKey.current = key;
    setState((s) =>
      sameInputs && s.data !== undefined ? s : { data: undefined, loading: true, error: null },
    );
    loader
      .current()
      .then((data) => live && setState({ data, loading: false, error: null }))
      .catch((err) => {
        if (!live) return;
        setState((s) => ({
          data: s.data,
          loading: false,
          error: err instanceof CheatsheetUnavailableError && err.offline ? 'offline' : 'failed',
        }));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, refreshTick]);

  const reload = useCallback(() => {
    setState({ data: undefined, loading: true, error: null });
    setTick((n) => n + 1);
  }, []);

  return { ...state, reload };
}
