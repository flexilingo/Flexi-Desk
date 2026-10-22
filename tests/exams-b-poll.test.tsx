import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExamCompletionPoll } from '@/pages/celpip/hooks/useExamCompletionPoll';
import type { SectionResult } from '@/pages/celpip/types';

const row = (
  section_type: SectionResult['section_type'],
  scoring_state?: SectionResult['scoring_state'],
  status: SectionResult['status'] = 'scoring',
) =>
  ({
    section_type,
    section_index: 0,
    status,
    scoring_state,
    clb_score: null,
    raw_score: null,
    max_raw_score: null,
    time_spent_sec: 0,
    answers: null,
    transcripts: null,
    ai_feedback: null,
  }) as SectionResult;

describe('completion poll', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports per-section state and how many are done', () => {
    const { result } = renderHook(() =>
      useExamCompletionPoll(
        true,
        [row('listening', 'done', 'scored'), row('writing', 'analyzing'), row('speaking')],
        () => {},
      ),
    );
    expect(result.current.sectionStates).toEqual({
      listening: 'done',
      writing: 'analyzing',
      speaking: 'queued',
    });
    expect(result.current.progress).toEqual({ done: 1, total: 3 });
  });

  it('keeps reading the result every 4 s while a section is not done, then stops', () => {
    const refetch = vi.fn();
    const { rerender } = renderHook(({ rows }) => useExamCompletionPoll(true, rows, refetch), {
      initialProps: { rows: [row('writing', 'analyzing')] },
    });
    act(() => void vi.advanceTimersByTime(4000));
    expect(refetch).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(8000));
    expect(refetch).toHaveBeenCalledTimes(3);
    rerender({ rows: [row('writing', 'done', 'scored')] });
    act(() => void vi.advanceTimersByTime(20000));
    expect(refetch).toHaveBeenCalledTimes(3);
  });

  it('never gives up: after 5 minutes it slows to 20 s and says it is taking longer', () => {
    const refetch = vi.fn();
    const { result } = renderHook(() =>
      useExamCompletionPoll(true, [row('speaking', 'queued')], refetch),
    );
    act(() => void vi.advanceTimersByTime(5 * 60 * 1000 + 4000));
    expect(result.current.stalled).toBe(true);
    const before = refetch.mock.calls.length;
    act(() => void vi.advanceTimersByTime(20_000));
    expect(refetch.mock.calls.length).toBe(before + 1);
    act(() => result.current.retry());
    expect(result.current.stalled).toBe(false);
  });

  it('does nothing while disabled', () => {
    const refetch = vi.fn();
    renderHook(() => useExamCompletionPoll(false, [row('writing', 'queued')], refetch));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(refetch).not.toHaveBeenCalled();
  });
});
