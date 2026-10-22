import { describe, it, expect, vi } from 'vitest';
import { isNetworkUploadError, withUploadRetry } from '@/pages/celpip/utils/uploadRetry';
import {
  SubmitRetryQueue,
  classifySubmitError,
  isRetryable,
  retryDelayMs,
  type SubmitOutcome,
} from '@/pages/celpip/utils/submitRetry';
import { restoreWriting } from '@/pages/celpip/utils/writingResume';
import { initialTimeLeft, resumeAudio } from '@/pages/celpip/utils/examClocks';
import { startErrorCodeOf } from '@/pages/celpip/stores/celpipStore';

describe('upload retry', () => {
  it('knows a request that never got an answer', () => {
    expect(isNetworkUploadError('Storage upload failed: error sending request for url')).toBe(true);
    expect(isNetworkUploadError(new Error('Failed to fetch'))).toBe(true);
    expect(isNetworkUploadError('Storage upload failed (403): not allowed')).toBe(false);
    expect(isNetworkUploadError(null)).toBe(false);
  });

  it('retries a network failure after each pause and waits for the connection', async () => {
    const waits: string[] = [];
    let calls = 0;
    const result = await withUploadRetry(
      async () => {
        calls++;
        if (calls < 3) throw 'error sending request';
        return 'https://x/answer.wav';
      },
      {
        delays: [10, 20, 30],
        sleep: async (ms) => void waits.push(`sleep ${ms}`),
        waitOnline: async () => void waits.push('online'),
      },
    );
    expect(result).toBe('https://x/answer.wav');
    expect(calls).toBe(3);
    expect(waits).toEqual(['sleep 10', 'online', 'sleep 20', 'online']);
  });

  it('fails at once on a refusal, and gives up after the last pause', async () => {
    const refused = vi.fn(async () => {
      throw 'Storage upload failed (403): denied';
    });
    await expect(
      withUploadRetry(refused, { sleep: async () => {}, waitOnline: async () => {} }),
    ).rejects.toBe('Storage upload failed (403): denied');
    expect(refused).toHaveBeenCalledTimes(1);
    const down = vi.fn(async () => {
      throw 'error sending request';
    });
    await expect(
      withUploadRetry(down, { delays: [1, 1], sleep: async () => {}, waitOnline: async () => {} }),
    ).rejects.toBe('error sending request');
    expect(down).toHaveBeenCalledTimes(3);
  });
});

describe('submitting a section when the connection comes and goes', () => {
  const server = (status: number, code = '') =>
    JSON.stringify({ status, error: 'x', code, data: {} });

  it('classifies what a failed submit means', () => {
    expect(classifySubmitError('API request failed: error sending request')).toEqual({
      kind: 'offline',
    });
    expect(classifySubmitError(server(503))).toEqual({ kind: 'unreachable' });
    expect(classifySubmitError(server(400, 'SECTION_ALREADY_SUBMITTED'))).toEqual({
      kind: 'held',
      code: 'SECTION_ALREADY_SUBMITTED',
    });
    expect(classifySubmitError(server(400, 'SECTIONS_INCOMPLETE'))).toEqual({
      kind: 'rejected',
      code: 'SECTIONS_INCOMPLETE',
    });
    expect(classifySubmitError('weird', false)).toEqual({ kind: 'offline' });
    expect(isRetryable({ kind: 'offline' })).toBe(true);
    expect(isRetryable({ kind: 'sent' })).toBe(false);
  });

  it('backs off 3, 6, 12, 20, 30 s and repeats the last', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((n) => retryDelayMs(n))).toEqual([
      3000, 6000, 12000, 20000, 30000, 30000, 30000,
    ]);
  });

  it('keeps the payload through a drop and sends it again by itself, never two at once', async () => {
    const outcomes: SubmitOutcome[] = [
      { kind: 'offline' },
      { kind: 'unreachable' },
      { kind: 'sent' },
    ];
    const sent: string[] = [];
    const timers: Array<() => void> = [];
    const settled: string[] = [];
    const queue = new SubmitRetryQueue<string>({
      attempt: async (p) => {
        sent.push(p);
        return outcomes.shift()!;
      },
      onSettled: (o, _p, failures) => settled.push(`${o.kind}:${failures}`),
      schedule: (fn) => {
        timers.push(fn);
        return timers.length;
      },
      cancel: () => {},
    });
    queue.submit('answers-v1');
    await vi.waitFor(() => expect(settled).toEqual(['offline:1']));
    expect(queue.hasPending).toBe(true);
    timers.shift()!();
    await vi.waitFor(() => expect(settled).toEqual(['offline:1', 'unreachable:2']));
    timers.shift()!();
    await vi.waitFor(() => expect(settled).toHaveLength(3));
    expect(settled[2]).toBe('sent:2');
    expect(sent).toEqual(['answers-v1', 'answers-v1', 'answers-v1']);
    expect(queue.hasPending).toBe(false);
  });

  it('names a start that never reached the server', () => {
    expect(startErrorCodeOf('API request failed: error sending request')).toBe('NETWORK_ERROR');
    expect(
      startErrorCodeOf(
        JSON.stringify({ status: 400, error: 'x', code: 'INSUFFICIENT_PARTS', data: {} }),
      ),
    ).toBe('INSUFFICIENT_PARTS');
  });
});

describe('coming back to a half-finished section', () => {
  const tasks = [{ time_limit_minutes: 27 }, { time_limit_minutes: 26 }];

  it('Writing reopens from the draft, a practice counts only time spent, a full sitting the wall clock', () => {
    const draft = {
      taskIndex: 1,
      answers: { task_0: 'Dear Sam', task_1: 'I think' },
      taskStartedAt: 1_000_000,
      sectionStartedAt: 900_000,
      activeSec: 300,
    };
    const practice = restoreWriting(draft, tasks, true, 1_000_000 + 3 * 3600_000);
    expect(practice.taskIndex).toBe(1);
    expect(practice.answers.task_1).toBe('I think');
    expect(practice.timeLeft).toBe(26 * 60 - 300);
    const full = restoreWriting(draft, tasks, false, 1_000_000 + 600_000);
    expect(full.timeLeft).toBe(26 * 60 - 600);
    // clock long run out: floors at zero, never negative, and nothing is submitted by this
    expect(restoreWriting(draft, tasks, false, 1_000_000 + 9 * 3600_000).timeLeft).toBe(0);
    expect(restoreWriting(null, tasks, true, 5).timeLeft).toBe(27 * 60);
  });

  it('Listening resumes the clock and the recording where they stood', () => {
    expect(initialTimeLeft({ sectionStartedAt: 0, activeSec: 100 }, 3300, true, 9_999_999)).toBe(
      3200,
    );
    expect(
      initialTimeLeft({ sectionStartedAt: 1_000, pausedSec: 20 }, 3300, false, 1_000 + 120_000),
    ).toBe(3200);
    expect(initialTimeLeft(null, 3300, true, 0)).toBe(3300);
    const part = { partIndex: 2, audio: { partIndex: 2, pos: 61, done: false } };
    expect(resumeAudio(part)).toEqual({ startAt: 59, done: false });
    expect(resumeAudio({ partIndex: 3, audio: { partIndex: 2, pos: 61, done: false } })).toEqual({
      startAt: 0,
      done: false,
    });
    expect(resumeAudio({ partIndex: 2, audio: { partIndex: 2, pos: 0, done: true } })).toEqual({
      startAt: 0,
      done: true,
    });
  });
});
