import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: vi.fn() }));

import { isRankedSession, isResumable, errorCodeOf } from '@/pages/celpip/stores/celpipStore';
import { EXAM_SESSION_TTL_MS } from '@/pages/celpip/types';
import type { ExamSession } from '@/pages/celpip/types';

/**
 * Two rules the backend also enforces. If the client disagrees, the user either
 * sees a resume button for an exam the server already expired, or a learning-mode
 * session quietly poisons their score average.
 */

function session(over: Partial<ExamSession> = {}): ExamSession {
  return {
    id: 's1',
    user_id: 'u1',
    exam_type: 'celpip',
    status: 'completed',
    current_section: 4,
    listening_score: 8,
    reading_score: 8,
    writing_score: 8,
    speaking_score: 8,
    m_score: 8,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...over,
  } as ExamSession;
}

describe('ranked sessions (history + averages)', () => {
  it('counts a completed, scored, non-learning exam', () => {
    expect(isRankedSession(session())).toBe(true);
  });

  it('excludes learning-mode sessions — the backend keeps them out of history too', () => {
    expect(isRankedSession(session({ practice_config: { learning_mode: true } }))).toBe(false);
  });

  it('excludes unfinished sessions', () => {
    expect(isRankedSession(session({ status: 'in_progress' }))).toBe(false);
  });

  it('excludes a completed session that never got an m_score', () => {
    expect(isRankedSession(session({ m_score: null }))).toBe(false);
  });
});

describe('resumable sessions (4h TTL mirrors the backend)', () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

  it('a fresh in-progress exam resumes', () => {
    const s = session({ status: 'in_progress', started_at: minutesAgo(10) });
    expect(isResumable(s, EXAM_SESSION_TTL_MS)).toBe(true);
  });

  it('an exam older than the TTL does not resume', () => {
    const s = session({ status: 'in_progress', started_at: minutesAgo(4 * 60 + 1) });
    expect(isResumable(s, EXAM_SESSION_TTL_MS)).toBe(false);
  });

  it('a completed exam never resumes', () => {
    expect(isResumable(session(), EXAM_SESSION_TTL_MS)).toBe(false);
  });

  it('learning mode is untimed, so it resumes however old it is', () => {
    const s = session({
      status: 'in_progress',
      started_at: minutesAgo(60 * 24 * 7),
      practice_config: { learning_mode: true },
    });
    expect(isResumable(s, EXAM_SESSION_TTL_MS)).toBe(true);
  });

  it('falls back to created_at when the exam was never started', () => {
    const s = session({ status: 'not_started', started_at: null, created_at: minutesAgo(5) });
    expect(isResumable(s, EXAM_SESSION_TTL_MS)).toBe(true);
  });
});

describe('backend error codes', () => {
  it('pulls the code out of the JSON supabaseCall rejects with', () => {
    expect(errorCodeOf(`{"status":429,"error":"cooldown","code":"EXAM_COOLDOWN"}`)).toBe(
      'EXAM_COOLDOWN',
    );
  });

  it('accepts a bare code from a Rust command', () => {
    expect(errorCodeOf('WHISPER_NOT_CONFIGURED')).toBe('WHISPER_NOT_CONFIGURED');
  });

  it('never leaks a raw message at the user', () => {
    expect(errorCodeOf(new Error('socket hang up'))).toBe('UNKNOWN_ERROR');
  });
});
