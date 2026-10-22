import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * Windows QA (W4, W6, W12): a computer with no working microphone must still be
 * able to finish the exam (Skip submits the speaking tasks unanswered, like the
 * website's per-task Skip); the intro names the questions the section really
 * holds; a one-section practice is "section 1 of 1".
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
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'n' in opts ? `${key}:${String(opts.n)}` : key,
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { useCelpipStore } from '@/pages/celpip/stores/celpipStore';
import { ExamEngine } from '@/pages/celpip/components/session/ExamEngine';
import { micFailureOf, probeVerdict } from '@/pages/celpip/services/micProbe';

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
const task = (n: number) => ({ task_number: n, title: `T${n}`, prompt: 'Say something', prep_seconds: 30, speaking_seconds: 60 });
const qs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, question: 'Q', options: ['a', 'b'] }));

/** A speaking-only CELPIP practice: section 4 canonically, the only one this session holds. */
function speakingOnlyServer() {
  let current = 3;
  const submits: unknown[] = [];
  const detail = () => ({
    session: {
      id: 's1',
      user_id: 'u',
      exam_type: 'celpip',
      status: 'in_progress',
      mode: 'practice',
      current_section: current,
      practice_config: { sections_order: [3] },
    },
    exam_set: {
      id: 'e',
      title: 't',
      listening_content: { parts: [] },
      reading_content: { parts: [] },
      writing_prompts: { tasks: [] },
      speaking_prompts: { tasks: [task(1), task(2), task(3)] },
      audio_urls: {},
    },
    section_results: [row('speaking', 3, current > 3 ? 'scoring' : 'pending')],
  });
  callMock.mockImplementation(async (...a: unknown[]) => {
    const url = String(a[1]);
    if (url.includes('action=get_session')) return detail();
    if (url.includes('action=submit_section')) {
      submits.push(a[2]);
      current = 4;
      return { session: { current_section: 4 }, section_result: row('speaking', 3, 'scoring') };
    }
    if (url.includes('action=complete_exam')) return { session: { status: 'completed' } };
    return {};
  });
  return { submits };
}

function renderEngine() {
  return render(
    <MemoryRouter initialEntries={['/exam/s1']}>
      <Routes>
        <Route path="/exam/:sessionId" element={<ExamEngine />} />
        <Route path="*" element={<div data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  callMock.mockReset();
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    // This computer has no capture device at all.
    if (cmd === 'celpip_mic_probe_start') throw 'No default audio input device available';
    return null;
  });
  useCelpipStore.setState({ detail: null, error: null, isSubmitting: false, isCompleting: false });
});

describe('microphone verdicts', () => {
  it('tells "no device", "blocked" and "silent" apart', () => {
    expect(micFailureOf('No default audio input device available')).toBe('no-device');
    expect(
      micFailureOf(
        'Failed to build f32 stream: The requested device is no longer available. For example, it has been unplugged.',
      ),
    ).toBe('no-device');
    expect(micFailureOf('Failed to build f32 stream: 0x80070005 access denied')).toBe('denied');
    // It opened, but not one sample of sound: macOS blocks that way; elsewhere muted/blocked.
    expect(probeVerdict(-100, 'mac')).toBe('denied');
    expect(probeVerdict(-100, 'windows')).toBe('silent');
    expect(probeVerdict(-55, 'windows')).toBe('granted');
  });
});

describe('speaking without a microphone', () => {
  it('a speaking-only practice is section 1 of 1, and Skip submits it unanswered so the exam completes', async () => {
    const srv = speakingOnlyServer();
    renderEngine();

    // W12: position within the session's own sections.
    await screen.findByText('micCheckAllow');
    expect(screen.getByText((_, el) => el?.textContent === 'section 1 of 1')).toBeTruthy();

    fireEvent.click(screen.getByText('micCheckAllow'));
    await screen.findByTestId('mic-access-no-device');

    // Begin explains the way out instead of doing nothing.
    fireEvent.click(screen.getByText('startSection'));
    expect(screen.getByText('micRequiredOrSkipHint')).toBeTruthy();

    fireEvent.click(screen.getByTestId('skip-speaking-section'));
    fireEvent.click(await screen.findByText('micSkipSectionConfirm'));

    await waitFor(() => expect(srv.submits).toHaveLength(1));
    const body = srv.submits[0] as {
      section_type: string;
      answers: Record<string, unknown>;
      session_id: string;
    };
    expect(body.section_type).toBe('speaking');
    expect(body.session_id).toBe('s1');
    expect(body.answers).toEqual({ task_0: '', task_1: '', task_2: '' });

    // Every section done -> the engine completes the exam by itself.
    await waitFor(() =>
      expect(callMock.mock.calls.some((c) => String(c[1]).includes('complete_exam'))).toBe(true),
    );
  });

  it('the listening intro names the questions the section really holds', async () => {
    callMock.mockImplementation(async (...a: unknown[]) => {
      if (String(a[1]).includes('action=get_session')) {
        return {
          session: { id: 's1', user_id: 'u', exam_type: 'celpip', status: 'in_progress', mode: 'exam', current_section: 0 },
          exam_set: {
            id: 'e',
            title: 't',
            listening_content: {
              parts: [8, 5, 6, 5, 8, 6].map((n, i) => ({ part_index: i, title: 'P', questions: qs(n) })),
            },
            reading_content: { parts: [] },
            writing_prompts: { tasks: [] },
            speaking_prompts: { tasks: [] },
            audio_urls: {},
          },
          section_results: ['listening', 'reading', 'writing', 'speaking'].map((t, i) => row(t, i)),
        };
      }
      return {};
    });
    renderEngine();
    // 8+5+6+5+8+6 = 38, never the 47 the old copy said.
    expect(await screen.findByText('sectionIntro.listening.duration:38')).toBeTruthy();
    expect(screen.getByText((_, el) => el?.textContent === 'section 1 of 4')).toBeTruthy();
  });
});
