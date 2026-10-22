import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { POSITION_DEBOUNCE_MS, useReaderPager, type PagerPage } from '@/pages/reader/text/useReaderPager';

const TOTAL = 5;
const makePage = (n: number): PagerPage => ({
  page_number: n,
  page_count: TOTAL,
  content: `Page ${n} about Toronto.`,
  title: 'Toronto',
  language: 'en',
  chapter_title: null,
  truncated: false,
  has_prev: n > 1,
  has_next: n < TOTAL,
});

let fetchPage: ReturnType<typeof vi.fn>;
let save: ReturnType<typeof vi.fn>;

const wrapper = (initial: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;
  };

function setup(opts: { url?: string; last?: number; ready?: boolean; withSave?: boolean } = {}) {
  return renderHook(
    (props: { last?: number; ready: boolean }) =>
      useReaderPager({
        id: 'b1',
        fetchPage: fetchPage as unknown as (p: number) => Promise<PagerPage>,
        savePosition: opts.withSave === false ? undefined : (save as unknown as (p: number) => void),
        serverLastPage: props.last,
        isReady: props.ready,
      }),
    { wrapper: wrapper(opts.url ?? '/book'), initialProps: { last: opts.last, ready: opts.ready ?? true } },
  );
}

beforeEach(() => {
  fetchPage = vi.fn(async (n: number) => makePage(Math.min(Math.max(n, 1), TOTAL)));
  save = vi.fn(async () => ({ ok: true }));
});
afterEach(() => vi.useRealTimers());

describe('useReaderPager', () => {
  it('asks for nothing until the source is ready', async () => {
    const { result, rerender } = setup({ ready: false });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    rerender({ last: undefined, ready: true });
    await waitFor(() => expect(result.current.text).toBe('Page 1 about Toronto.'));
  });

  it('seeds the page from the bookmark once, and prefetches both neighbours', async () => {
    const { result, rerender } = setup({ last: 3 });
    await waitFor(() => expect(result.current.text).toContain('Page 3 '));
    expect(result.current.text).toContain('Page 3');
    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith(4));
    expect(fetchPage).toHaveBeenCalledWith(2);
    // A later, different bookmark never moves the reader.
    rerender({ last: 5, ready: true });
    act(() => result.current.goTo(2));
    await waitFor(() => expect(result.current.text).toContain('Page 2 '));
    rerender({ last: 5, ready: true });
    expect(result.current.page).toBe(2);
  });

  it('the page in the URL wins over the bookmark, and out-of-range turns are clamped', async () => {
    const { result } = setup({ url: '/book?page=2', last: 4 });
    await waitFor(() => expect(result.current.text).toContain('Page 2 '));
    act(() => result.current.goTo(99));
    await waitFor(() => expect(result.current.text).toContain(`Page ${TOTAL} `));
    act(() => result.current.goTo(-3));
    await waitFor(() => expect(result.current.text).toContain('Page 1 '));
  });

  it('does not ask twice for a page it already holds', async () => {
    const { result } = setup({ last: 2 });
    await waitFor(() => expect(result.current.text).toContain('Page 2 '));
    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith(3));
    const before = fetchPage.mock.calls.filter(([n]) => n === 3).length;
    act(() => result.current.next());
    await waitFor(() => expect(result.current.text).toContain('Page 3 '));
    expect(fetchPage.mock.calls.filter(([n]) => n === 3).length).toBe(before);
  });

  it('shows a failed page as an error and loads it again on retry', async () => {
    fetchPage.mockRejectedValueOnce('PAGE_FETCH_FAILED');
    const { result } = setup();
    await waitFor(() => expect(result.current.error).toBe('PAGE_FETCH_FAILED'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.text).toContain('Page 1'));
    expect(result.current.error).toBeNull();
  });

  it('saves the bookmark after the debounce, only once a page was turned', async () => {
    const { result } = setup({ last: 2 });
    await waitFor(() => expect(result.current.text).toContain('Page 2 '));
    vi.useFakeTimers();
    // Arrival alone writes nothing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POSITION_DEBOUNCE_MS * 2);
    });
    expect(save).not.toHaveBeenCalled();

    act(() => result.current.goTo(3));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    act(() => result.current.goTo(4));
    // Lets the page land (state flushes when each act ends) so the debounce starts.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POSITION_DEBOUNCE_MS - 100);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(4);
  });

  it('flushes the pending bookmark when the reader leaves', async () => {
    const { result, unmount } = setup({ last: 2 });
    await waitFor(() => expect(result.current.text).toContain('Page 2 '));
    act(() => result.current.next());
    await waitFor(() => expect(result.current.text).toContain('Page 3 '));
    expect(save).not.toHaveBeenCalled();
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3);
  });

  it('survives a bookmark that fails to save, and a source with nowhere to save', async () => {
    save.mockRejectedValue('POSITION_SAVE_FAILED');
    const a = setup({ last: 2 });
    await waitFor(() => expect(a.result.current.page).toBe(2));
    act(() => a.result.current.next());
    await waitFor(() => expect(a.result.current.page).toBe(3));
    expect(() => a.unmount()).not.toThrow();

    const b = setup({ last: 2, withSave: false });
    await waitFor(() => expect(b.result.current.page).toBe(2));
    act(() => b.result.current.next());
    await waitFor(() => expect(b.result.current.page).toBe(3));
    expect(() => b.unmount()).not.toThrow();
  });
});
