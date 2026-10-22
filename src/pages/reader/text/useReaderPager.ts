import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** What the text view needs of one page, whichever source it came from. */
export interface PagerPage {
  page_number: number;
  page_count: number;
  content: string;
  title: string;
  language: string;
  chapter_title?: string | null;
  truncated: boolean;
  has_prev: boolean;
  has_next: boolean;
}

export interface ReaderPagerOptions {
  /** What is being read; a new id starts over (fresh cache, no pending bookmark). */
  id: string;
  /** Fetches one page. Must keep its identity while the source is the same. */
  fetchPage: (page: number) => Promise<PagerPage>;
  /** Writes the bookmark. Omitted where there is nowhere to write it. */
  savePosition?: (page: number) => Promise<unknown> | void;
  /** The page the bookmark says. Read once, to seed the URL. */
  serverLastPage: number | undefined;
  /** Pages are only asked for once the source is known (the bookmark has loaded, the account is settled). */
  isReady: boolean;
}

/** Everything a reading surface needs to know about where it is. */
export type ReaderPagerState = ReturnType<typeof useReaderPager>;

export const POSITION_DEBOUNCE_MS = 1500;

/**
 * Page state for one text source: which page, how to move, the look-ahead and the bookmark.
 * Ported from the website's `useReaderPager`, which read a RTK Query cache; here the cache
 * is a map of promises, and the page number still lives in the URL (the router's query), so
 * Back and a reload keep the reader's place.
 */
export function useReaderPager({
  id,
  fetchPage,
  savePosition,
  serverLastPage,
  isReady,
}: ReaderPagerOptions) {
  const [params, setParams] = useSearchParams();

  const urlPage = Number(params.get('page'));
  const page = Number.isInteger(urlPage) && urlPage > 0 ? urlPage : null;
  const current = page ?? serverLastPage ?? 1;

  // ── The pages: a cache of promises, one entry per page ──
  const cache = useRef(new Map<number, Promise<PagerPage>>());
  const cacheOwner = useRef({ id, fetchPage });
  if (cacheOwner.current.id !== id || cacheOwner.current.fetchPage !== fetchPage) {
    cacheOwner.current = { id, fetchPage };
    cache.current = new Map();
  }
  const load = useCallback(
    (n: number) => {
      const hit = cache.current.get(n);
      if (hit) return hit;
      const started = fetchPage(n);
      cache.current.set(n, started);
      // A failed page is asked for again next time, not remembered as failed.
      started.catch(() => {
        if (cache.current.get(n) === started) cache.current.delete(n);
      });
      return started;
    },
    [fetchPage],
  );

  const [data, setData] = useState<PagerPage | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  // A different source drops the old page at once.
  useEffect(() => {
    setData(null);
    setError(null);
  }, [id]);

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    setFetching(true);
    setError(null);
    load(current)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setFetching(false);
        // Two pages of look-ahead, no more: a 400-page book must not prefetch itself.
        for (const n of [current + 1, current - 1]) {
          if (n >= 1 && n <= result.page_count) load(n).catch(() => {});
        }
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause);
        setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isReady, current, load, attempt]);

  const total = data?.page_count ?? 0;

  /**
   * Writes the URL without clamping. The clamp belongs to user navigation only: on the
   * first render `total` is still 0, so clamping the bookmark here would rewrite every
   * resumed document to page 1.
   */
  const viaUrl = useCallback(
    (next: number) => {
      setParams(
        (prev) => {
          const search = new URLSearchParams(prev);
          search.set('page', String(next));
          return search;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const navigated = useRef(false);
  const goTo = useCallback(
    (next: number) => {
      navigated.current = true;
      viaUrl(Math.min(Math.max(next, 1), total || next));
    },
    [viaUrl, total],
  );

  // Seed the URL from the bookmark ONCE, when the URL is silent. After that the bookmark is
  // never read again — otherwise a slow response would yank the reader back to where they
  // were three pages ago.
  const seeded = useRef(false);
  useEffect(() => {
    seeded.current = false;
  }, [id]);
  useEffect(() => {
    if (seeded.current || page !== null || !serverLastPage || serverLastPage <= 1) return;
    seeded.current = true;
    viaUrl(serverLastPage);
  }, [page, serverLastPage, viaUrl]);

  /**
   * Bookmark, debounced and fire-and-forget — a failed bookmark must never interrupt
   * reading. Only written once the reader has actually turned a page: saving on mere
   * arrival would touch "last read" for a document that was opened and closed, and would
   * let a first render overwrite a real bookmark.
   */
  const pending = useRef<number | null>(null);
  const saveRef = useRef(savePosition);
  useEffect(() => {
    saveRef.current = savePosition;
  }, [savePosition]);
  const write = (target: number) => {
    try {
      void Promise.resolve(saveRef.current?.(target)).catch(() => {});
    } catch {
      /* a bookmark that cannot be written is not worth a broken page */
    }
  };

  useEffect(() => {
    navigated.current = false;
    pending.current = null;
  }, [id]);

  useEffect(() => {
    if (!navigated.current || !data) return;
    pending.current = current;
    const timer = setTimeout(() => {
      const target = pending.current;
      pending.current = null;
      if (target !== null) write(target);
    }, POSITION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [current, data, id]);

  // Leaving within the debounce window would otherwise drop the only save for the page the
  // reader actually stopped on — the exact page they want back.
  useEffect(() => {
    return () => {
      const target = pending.current;
      pending.current = null;
      if (target !== null) write(target);
    };
  }, [id]);

  return useMemo(
    () => ({
      page: data?.page_number ?? current,
      total: total || 1,
      text: data?.content ?? '',
      title: data?.title ?? '',
      language: data?.language ?? 'en',
      truncated: data?.truncated ?? false,
      chapterTitle: data?.chapter_title ?? null,
      hasPrev: data?.has_prev ?? false,
      hasNext: data?.has_next ?? false,
      isLoading: isReady && !data && !error,
      isFetching: fetching,
      error,
      goTo,
      next: () => goTo(current + 1),
      prev: () => goTo(current - 1),
      retry: () => setAttempt((n) => n + 1),
    }),
    [data, current, total, isReady, fetching, error, goTo],
  );
}
