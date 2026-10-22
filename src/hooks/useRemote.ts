import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Load something from the cloud once per `deps` change, with loading, error and a
 * `reload`. A late answer for an older request is dropped, so a quick filter change
 * never shows the previous filter's list.
 */
export function useRemote<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  enabled = true,
): {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (next: T | null) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(enabled);
  const ticket = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const run = useCallback(async () => {
    const mine = ++ticket.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchRef.current();
      if (mine === ticket.current) setData(next);
    } catch (e) {
      if (mine === ticket.current) setError(e);
    } finally {
      if (mine === ticket.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      ticket.current++;
      setLoading(false);
      return;
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, error, loading, reload: run, setData };
}
