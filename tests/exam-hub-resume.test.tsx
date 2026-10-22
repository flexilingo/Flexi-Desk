import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';

/**
 * Windows QA (W1, W2): the hub's "exam in progress" card and its Resume are the
 * most recent unfinished sitting of THIS exam type; Start is always there; a
 * sitting past its time limit is marked; the session count matches the coach
 * card. Starting a full exam while one is open asks: resume it, or end it.
 */

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const { callMock } = vi.hoisted(() => ({
  callMock: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({})),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null), convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: callMock }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && typeof opts === 'object' && 'current' in opts ? `${key}:${opts.current}/${opts.total}` : key,
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { useAuthStore } from '@/stores/authStore';
import { useCelpipStore, latestResumable, expiredUnfinished } from '@/pages/celpip/stores/celpipStore';
import { CelpipLandingPage } from '@/pages/celpip/components/CelpipLandingPage';
import { StartExamDialog } from '@/pages/celpip/components/landing/StartExamDialog';
import { EXAM_SESSION_TTL_MS } from '@/pages/celpip/types';
import type { ExamSession } from '@/pages/celpip/types';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const session = (over: Partial<ExamSession>): ExamSession =>
  ({
    id: 'x',
    user_id: 'u',
    exam_type: 'celpip',
    status: 'in_progress',
    mode: 'exam',
    current_section: 0,
    started_at: ago(10),
    created_at: ago(10),
    m_score: null,
    ...over,
  }) as ExamSession;

// The list as the server returned it on the laptop: an older one first.
const SESSIONS = [
  session({ id: 'old-practice', mode: 'practice', current_section: 2, started_at: ago(90), created_at: ago(90), practice_config: { sections_order: [2] } }),
  session({ id: 'new-full', current_section: 1, started_at: ago(5), created_at: ago(5) }),
  session({ id: 'stale', started_at: ago(60 * 5), created_at: ago(60 * 5) }),
  session({ id: 'done-1', status: 'completed', m_score: 7 }),
  session({ id: 'done-learning', status: 'completed', m_score: 9, practice_config: { learning_mode: true } }),
];

function Where() {
  const { id } = useParams();
  return <div data-testid="opened">{id}</div>;
}

beforeEach(() => {
  callMock.mockReset();
  callMock.mockImplementation(async (...a: unknown[]) =>
    String(a[1]).includes('get_my_sessions') ? { sessions: SESSIONS } : {},
  );
  useAuthStore.setState({ session: { user: { id: 'u' } } as never, isLoading: false });
  useCelpipStore.setState({ sessions: [], error: null, startResumed: false });
});

describe('which unfinished sitting the hub offers', () => {
  it('the most recent one with a section left, inside its time limit', () => {
    expect(latestResumable(SESSIONS, EXAM_SESSION_TTL_MS)?.id).toBe('new-full');
    expect(expiredUnfinished(SESSIONS, EXAM_SESSION_TTL_MS).map((s) => s.id)).toEqual(['stale']);
  });

  it('card, Resume and Start: same session, Start still offered, expired marked, one count', async () => {
    render(
      <MemoryRouter initialEntries={['/exam/celpip']}>
        <Routes>
          <Route path="/exam/celpip" element={<CelpipLandingPage examType="celpip" />} />
          <Route path="/exam/celpip/session/:id" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    const card = await screen.findByTestId('hub-in-progress');
    // new-full is at section 2 of 4 (the old practice would say 1 of 1).
    expect(card.textContent).toContain('currentSectionProgress:2/4');
    expect(screen.getByTestId('hub-start')).toBeTruthy();
    expect(screen.getAllByTestId('hub-expired')).toHaveLength(1);
    // Two completed sessions, as the coach card counts them (not only the ranked one).
    const tile = screen.getByText('statsTotalExams').closest('div')!.parentElement!;
    expect(tile.textContent).toContain('2');

    fireEvent.click(screen.getByTestId('hub-resume'));
    expect((await screen.findByTestId('opened')).textContent).toBe('new-full');
  });
});

describe('starting while a sitting is open', () => {
  it('asks resume-or-replace; replace ends the old one, then assembles the new exam', async () => {
    let assembled = 0;
    callMock.mockImplementation(async (...a: unknown[]) => {
      const url = String(a[1]);
      if (url.includes('assemble_exam')) {
        assembled += 1;
        return assembled === 1
          ? { session_id: 'open-1', exam_type: 'celpip', status: 'in_progress', current_section: 2, resumed: true }
          : { session_id: 'fresh-2', exam_type: 'celpip', status: 'not_started', current_section: 0 };
      }
      if (url.includes('complete_exam')) return { session: { status: 'completed' } };
      return {};
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<StartExamDialog open onClose={() => {}} />} />
          <Route path="/exam/celpip/session/:id" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText((_, el) => el?.tagName === 'BUTTON' && !!el.textContent?.includes('modeFullDesc')));
    fireEvent.click(screen.getByText('startExam'));
    await screen.findByTestId('start-open-session');
    expect(screen.queryByTestId('opened')).toBeNull();

    fireEvent.click(screen.getByText('openSessionReplace'));
    expect((await screen.findByTestId('opened')).textContent).toBe('fresh-2');
    const completeCall = callMock.mock.calls.find((c) => String(c[1]).includes('complete_exam'));
    expect(JSON.stringify(completeCall)).toContain('open-1');
    await waitFor(() => expect(assembled).toBe(2));
  });
});
