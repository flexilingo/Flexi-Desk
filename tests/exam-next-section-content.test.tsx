import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * The server sends a section's content only once it becomes current. A mock
 * server that withholds future sections until the previous one is submitted:
 * after submit_section the store must re-read the session, and the engine must
 * never show a section (or start its clock) without content.
 */

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const { invokeMock, callMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (_cmd: string, _args?: unknown): Promise<unknown> => null),
  callMock: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({})),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock, convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: callMock }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { useCelpipStore } from '@/pages/celpip/stores/celpipStore';
import { ExamEngine } from '@/pages/celpip/components/session/ExamEngine';

const q = (n: number) => ({ id: `q${n}`, question: `Question ${n}`, options: ['a', 'b'], correct: 'a' });
const part = { part_index: 0, title: 'P', questions: [q(1)] };
const empty = { parts: [] };
const row = (type: string, i: number, status = 'pending') => ({
  section_type: type,
  section_index: i,
  status,
  clb_score: null,
  raw_score: null,
  max_raw_score: null,
  time_spent_sec: 0,
  answers: null,
  transcripts: null,
  ai_feedback: null,
});

/** Mock server: `current` advances only on submit_section; only the current section ships content. */
function makeServer(opts: { failFirstReads?: number } = {}) {
  let current = 0;
  let failReads = opts.failFirstReads ?? 0;
  const types = ['listening', 'reading', 'writing', 'speaking'];
  const detail = () => ({
    session: {
      id: 's1',
      user_id: 'u',
      exam_type: 'tcf',
      status: 'in_progress',
      mode: 'exam',
      current_section: current,
    },
    exam_set: {
      id: 'e',
      title: 't',
      listening_content: current === 0 ? { parts: [part] } : empty,
      reading_content: current === 1 ? { parts: [{ ...part, questions: [q(2)] }] } : empty,
      writing_prompts: { tasks: [] },
      speaking_prompts: { tasks: [] },
      audio_urls: {},
    },
    section_results: types.map((t, i) => row(t, i, i < current ? 'scoring' : 'pending')),
  });
  callMock.mockImplementation(async (...a: unknown[]) => {
    const url = String(a[1]);
    if (url.includes('action=get_session')) {
      // A re-read right after the submit can fail; the server state is already advanced.
      if (current === 1 && failReads > 0) {
        failReads -= 1;
        throw new Error('NETWORK');
      }
      return detail();
    }
    if (url.includes('action=submit_section')) {
      current += 1;
      return { session: { current_section: current }, section_result: row('listening', 0, 'scoring') };
    }
    return {};
  });
  return { reads: () => callMock.mock.calls.filter((c) => String(c[1]).includes('get_session')).length };
}

beforeEach(() => {
  callMock.mockReset();
  invokeMock.mockReset();
  invokeMock.mockImplementation(async () => null);
  useCelpipStore.setState({ detail: null, error: null, isSubmitting: false });
});

describe('next section after submit_section', () => {
  it('store re-reads the session so the next section arrives with its content', async () => {
    const srv = makeServer();
    await useCelpipStore.getState().fetchDetail('s1');
    expect(useCelpipStore.getState().detail?.exam_set.reading_content.parts).toHaveLength(0);
    const ok = await useCelpipStore.getState().submit({
      session_id: 's1',
      section_type: 'listening',
      answers: { q1: 'a' },
      time_spent_sec: 5,
    });
    expect(ok).toBe(true);
    const d = useCelpipStore.getState().detail!;
    expect(d.session.current_section).toBe(1);
    expect(d.exam_set.reading_content.parts).toHaveLength(1);
    expect(srv.reads()).toBe(2);
  });

  it('engine shows a loading state, never an empty section, when the re-read fails', async () => {
    makeServer({ failFirstReads: 2 });
    await useCelpipStore.getState().fetchDetail('s1');
    render(
      <MemoryRouter initialEntries={['/exam/s1']}>
        <Routes>
          <Route path="/exam/:sessionId" element={<ExamEngine />} />
        </Routes>
      </MemoryRouter>,
    );
    await useCelpipStore.getState().submit({
      session_id: 's1',
      section_type: 'listening',
      answers: { q1: 'a' },
      time_spent_sec: 5,
    });
    // merge-only state: current section 1 without content -> loading, no intro
    expect(useCelpipStore.getState().detail?.exam_set.reading_content.parts).toHaveLength(0);
    await waitFor(() => expect(screen.queryByTestId('section-loading')).toBeTruthy());
    expect(screen.queryByText(/startSection|beginSection/i)).toBeNull();
    // the engine's own refetch brings the content in
    await waitFor(
      () => expect(useCelpipStore.getState().detail?.exam_set.reading_content.parts).toHaveLength(1),
      { timeout: 6000 },
    );
    await waitFor(() => expect(screen.queryByTestId('section-loading')).toBeNull());
  }, 15000);

  it('resume (fresh mount mid-exam) lands on the current section with content', async () => {
    makeServer();
    await useCelpipStore.getState().submit({ session_id: 's1', section_type: 'listening', answers: {}, time_spent_sec: 1 });
    await useCelpipStore.getState().fetchDetail('s1');
    const d = useCelpipStore.getState().detail!;
    expect(d.session.current_section).toBe(1);
    expect(d.exam_set.reading_content.parts).toHaveLength(1);
  });
});
