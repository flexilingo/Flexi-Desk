import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const supabaseCall = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: (...a: unknown[]) => supabaseCall(...a) }));

import {
  computeStats,
  countWords,
  elapsedSeconds,
  errorCodeOf,
  formatScore,
  formatTime,
  getMaxScore,
  isHighScore,
  mergeHistory,
  parseLimitError,
  routeOfId,
  timeRemaining,
} from '@/pages/writing-practice/lib/session';
import * as api from '@/pages/writing-practice/lib/api';
import type { WritingSession } from '@/pages/writing-practice/lib/types';

const sess = (o: Partial<WritingSession>): WritingSession =>
  ({
    id: 'x',
    user_id: 'u',
    exam_type: 'celpip',
    status: 'graded',
    word_count: 10,
    time_spent_seconds: 1,
    timer_enabled: true,
    started_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...o,
  }) as WritingSession;

describe('history and stats maths', () => {
  it('averages criteria over graded sessions only and picks best and weakest', () => {
    const stats = computeStats(
      [
        sess({ criteria_scores: { Vocabulary: 9, Readability: 5 } }),
        sess({ criteria_scores: { Vocabulary: 7, Readability: 6 } }),
        sess({ status: 'submitted', criteria_scores: { Vocabulary: 1, Readability: 12 } }),
      ],
      5,
    );
    expect(stats).toEqual({
      total_sessions: 5,
      graded_sessions: 2,
      best_criteria: 'Vocabulary',
      weakest_criteria: 'Readability',
    });
  });

  it('has no best or weakest before anything is graded', () => {
    const s = computeStats([sess({ status: 'submitted' })], 1);
    expect(s.graded_sessions).toBe(0);
    expect(s.best_criteria).toBeNull();
    expect(s.weakest_criteria).toBeNull();
  });

  it('merges local and cloud newest first and tags where each lives', () => {
    const merged = mergeHistory(
      [sess({ id: 'local-a', submitted_at: '2026-02-01T00:00:00Z' })],
      [
        sess({ id: 'c1', submitted_at: '2026-03-01T00:00:00Z' }),
        sess({ id: 'c0', submitted_at: '2026-01-15T00:00:00Z' }),
      ],
    );
    expect(merged.map((m) => [m.id, m.route])).toEqual([
      ['c1', 'cloud'],
      ['local-a', 'local'],
      ['c0', 'cloud'],
    ]);
  });

  it('uses the website score lines and maxima', () => {
    expect(isHighScore(6.5, 'ielts_task2')).toBe(true);
    expect(isHighScore(6, 'ielts_task1')).toBe(false);
    expect(isHighScore(8, 'celpip')).toBe(true);
    expect(isHighScore(null, 'celpip')).toBe(false);
    expect(getMaxScore('duolingo')).toBe(160);
    expect(getMaxScore('general_essay')).toBe(10);
    expect(formatScore(6.5, 'ielts_task1')).toBe('6.5');
    expect(formatScore(7.4, 'celpip')).toBe('7');
  });
});

describe('timer and word count', () => {
  const start = '2026-01-01T00:00:00Z';
  const t0 = new Date(start).getTime();
  it('counts down from the start time, so resuming keeps the clock', () => {
    expect(timeRemaining(start, 1200, t0 + 300_000)).toBe(900);
    expect(timeRemaining(start, 1200, t0 + 5_000_000)).toBe(0);
    expect(timeRemaining(start, null, t0)).toBeNull();
    expect(elapsedSeconds(start, t0 + 61_500)).toBe(61);
  });
  it('formats and counts', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(-3)).toBe('0:00');
    expect(countWords('  a b\n c ')).toBe(3);
    expect(countWords('')).toBe(0);
  });
  it('knows local from cloud ids', () => {
    expect(routeOfId('local-abc')).toBe('local');
    expect(routeOfId('3f1c-uuid')).toBe('cloud');
  });
});

describe('server error bodies', () => {
  const body = (data: object) =>
    JSON.stringify({ status: 429, error: 'MONTHLY_LIMIT_REACHED', code: '', data });
  it('reads the limit details of a 429', () => {
    expect(
      parseLimitError(body({ code: 'MONTHLY_LIMIT_REACHED', limitType: 'monthly', resetsAt: 'r', monthlyLimit: 5, dailyLimit: 1 })),
    ).toEqual({ limitType: 'monthly', resetsAt: 'r', monthlyLimit: 5, dailyLimit: 1 });
    expect(parseLimitError(body({ code: 'DAILY_LIMIT_REACHED' }))?.limitType).toBe('daily');
    expect(parseLimitError(JSON.stringify({ status: 500, error: 'X', code: 'X', data: {} }))).toBeNull();
    expect(parseLimitError('plain failure')).toBeNull();
  });
  it('finds the code in a cloud rejection and in a plain command error', () => {
    expect(errorCodeOf(JSON.stringify({ status: 400, error: 'WRITING_ESSAY_TOO_SHORT', code: 'WRITING_ESSAY_TOO_SHORT', data: {} }))).toBe('WRITING_ESSAY_TOO_SHORT');
    expect(errorCodeOf('WRITING_GRADING_FAILED')).toBe('WRITING_GRADING_FAILED');
    expect(errorCodeOf('something odd')).toBe('');
  });
});

describe('the local and cloud routes', () => {
  beforeEach(() => {
    invoke.mockReset();
    supabaseCall.mockReset();
  });

  it('local: the user\'s AI writes the prompt, then the session is created on this computer', async () => {
    invoke.mockImplementation(async (cmd: string) =>
      cmd === 'wp_generate_prompt'
        ? { id: 'wpp-1', prompt_text: 'Write.' }
        : { session_id: 'local-1', session: {}, prompt: {} },
    );
    const created = await api.startSession('local', 'celpip', true, 'advanced');
    expect(created.session_id).toBe('local-1');
    expect(invoke).toHaveBeenNthCalledWith(1, 'wp_generate_prompt', { examType: 'celpip', difficulty: 'advanced' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'wp_create_session', {
      examType: 'celpip',
      prompt: { id: 'wpp-1', prompt_text: 'Write.' },
      timerEnabled: true,
    });
    expect(supabaseCall).not.toHaveBeenCalled();
  });

  it('cloud: the server writes the prompt and counts the session', async () => {
    supabaseCall.mockImplementation(async (_m: string, path: string) =>
      path.includes('generate-prompt') ? { id: 'srv-p' } : { session_id: 'srv-1' },
    );
    const created = await api.startSession('cloud', 'ielts_task1', false);
    expect(created.session_id).toBe('srv-1');
    expect(supabaseCall).toHaveBeenNthCalledWith(1, 'GET', '/writing-practice?action=generate-prompt&exam_type=ielts_task1');
    expect(supabaseCall).toHaveBeenNthCalledWith(2, 'POST', '/writing-practice?action=create-session', {
      prompt_id: 'srv-p',
      exam_type: 'ielts_task1',
      timer_enabled: false,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('follows the session id for drafts, submit and cancel', async () => {
    invoke.mockResolvedValue(null);
    supabaseCall.mockResolvedValue(null);
    const draft = { essay_text: 'hi', word_count: 1, time_spent_seconds: 2 };
    await api.saveDraft({ session_id: 'local-1', ...draft });
    expect(invoke).toHaveBeenCalledWith('wp_save_draft', { sessionId: 'local-1', essayText: 'hi', wordCount: 1, timeSpentSeconds: 2 });
    await api.saveDraft({ session_id: 'uuid-9', ...draft });
    expect(supabaseCall).toHaveBeenCalledWith('POST', '/writing-practice?action=save-draft', { session_id: 'uuid-9', ...draft });
    await api.cancelSession('uuid-9');
    expect(supabaseCall).toHaveBeenCalledWith('POST', '/writing-practice?action=cancel', { session_id: 'uuid-9' });
  });

  it('only an active session counts as the one to resume', async () => {
    invoke.mockResolvedValue({ id: 'local-1', status: 'graded' });
    expect(await api.getActive('local')).toBeNull();
    invoke.mockResolvedValue({ id: 'local-2', status: 'active' });
    expect((await api.getActive('local'))?.id).toBe('local-2');
  });
});
