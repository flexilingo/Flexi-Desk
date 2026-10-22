import type { LimitInfo, SessionRoute, WritingSession, WritingStats } from './types';

export const MIN_WORDS = 20;
export const AUTOSAVE_DELAY_MS = 3000;

export const routeOfId = (id: string): SessionRoute =>
  id.startsWith('local-') ? 'local' : 'cloud';

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function formatScore(score: number, examType: string): string {
  return examType.startsWith('ielts') ? score.toFixed(1) : Math.round(score).toString();
}

export function getMaxScore(examType: string): number {
  if (examType.startsWith('ielts')) return 9;
  if (examType.startsWith('toefl')) return 5;
  if (examType === 'celpip') return 12;
  if (examType.startsWith('cambridge')) return 5;
  if (examType === 'pte') return 90;
  if (examType === 'duolingo') return 160;
  return 10;
}

/** The website's "good score" line for the green chip in the history list. */
export function isHighScore(score: number | null | undefined, examType: string): boolean {
  if (score == null) return false;
  if (examType.startsWith('ielts')) return score >= 6.5;
  if (examType.startsWith('toefl') || examType.startsWith('cambridge')) return score >= 3.5;
  if (examType === 'celpip') return score >= 8;
  if (examType === 'pte') return score >= 65;
  if (examType === 'duolingo') return score >= 110;
  return score >= 7;
}

/** Seconds since the session started: wall clock, so closing the app and resuming keeps counting. */
export function elapsedSeconds(startedAt: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

export function timeRemaining(
  startedAt: string,
  limitSeconds: number | null | undefined,
  now: number,
): number | null {
  if (!limitSeconds) return null;
  return Math.max(0, limitSeconds - elapsedSeconds(startedAt, now));
}

type Scored = Pick<WritingSession, 'status' | 'criteria_scores'>;

/**
 * The stats cards: total sessions, and the best and weakest criteria averaged over every
 * graded session (same rule as the server's `stats` action). `totalSessions` counts every
 * session of any status, supplied by the caller because history lists only finished ones.
 */
export function computeStats(sessions: Scored[], totalSessions: number): WritingStats {
  const sums: Record<string, { sum: number; n: number }> = {};
  let graded = 0;
  for (const s of sessions) {
    if (s.status !== 'graded') continue;
    graded += 1;
    for (const [name, score] of Object.entries(s.criteria_scores ?? {})) {
      if (typeof score !== 'number') continue;
      const e = (sums[name] ??= { sum: 0, n: 0 });
      e.sum += score;
      e.n += 1;
    }
  }
  let best: string | null = null;
  let weakest: string | null = null;
  let bestAvg = -Infinity;
  let worstAvg = Infinity;
  for (const [name, { sum, n }] of Object.entries(sums)) {
    const avg = sum / n;
    if (avg > bestAvg) {
      bestAvg = avg;
      best = name;
    }
    if (avg < worstAvg) {
      worstAvg = avg;
      weakest = name;
    }
  }
  return {
    total_sessions: totalSessions,
    graded_sessions: graded,
    best_criteria: best,
    weakest_criteria: weakest,
  };
}

export interface HistoryItem extends WritingSession {
  route: SessionRoute;
}

const sortKey = (s: WritingSession) => s.submitted_at ?? s.graded_at ?? s.created_at;

/** Local and cloud sessions in one newest-first list, each tagged with where it lives. */
export function mergeHistory(local: WritingSession[], cloud: WritingSession[]): HistoryItem[] {
  return [
    ...local.map((s) => ({ ...s, route: 'local' as const })),
    ...cloud.map((s) => ({ ...s, route: 'cloud' as const })),
  ].sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : sortKey(a) > sortKey(b) ? -1 : 0));
}

/** Reads the server's 429 body out of a `supabase_call` rejection. */
export function parseLimitError(err: unknown): LimitInfo | null {
  const raw =
    typeof err === 'string' ? err : err instanceof Error ? err.message : String(err ?? '');
  const start = raw.indexOf('{');
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(raw.slice(start)) as {
      code?: string;
      data?: {
        code?: string;
        limitType?: 'daily' | 'monthly';
        resetsAt?: string;
        monthlyLimit?: number | null;
        dailyLimit?: number | null;
      };
    };
    const code = parsed.data?.code ?? parsed.code;
    if (
      code !== 'DAILY_LIMIT_REACHED' &&
      code !== 'MONTHLY_LIMIT_REACHED' &&
      code !== 'WRITING_PRACTICE_LIMIT_REACHED'
    )
      return null;
    return {
      limitType: parsed.data?.limitType ?? (code === 'DAILY_LIMIT_REACHED' ? 'daily' : 'monthly'),
      resetsAt: parsed.data?.resetsAt ?? '',
      monthlyLimit: parsed.data?.monthlyLimit,
      dailyLimit: parsed.data?.dailyLimit,
    };
  } catch {
    return null;
  }
}

/** The error code behind a rejection from a local command or the cloud (`WRITING_*`, ...), or ''. */
export function errorCodeOf(err: unknown): string {
  const raw =
    typeof err === 'string' ? err : err instanceof Error ? err.message : String(err ?? '');
  const start = raw.indexOf('{');
  if (start !== -1) {
    try {
      const p = JSON.parse(raw.slice(start)) as {
        code?: string;
        error?: string;
        data?: { code?: string };
      };
      const c = p.data?.code || p.code || p.error || '';
      if (/^[A-Z0-9_]+$/.test(c)) return c;
    } catch {
      /* fall through to the plain-code path */
    }
  }
  const m = raw.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/);
  return m ? m[0] : '';
}
