import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Windows QA (W5): the exam insight on a slow computer's own model spun for 37
 * minutes, then failed with no reason. Every call to the user's AI now has a time
 * limit (Rust: `AI_TIMEOUT`) and a Cancel (`AI_CANCELLED`); the UI shows the
 * elapsed time, a Cancel button, a plain "took too long" message and Try again,
 * and stops queueing more work after a timeout.
 */

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (_cmd: string, _args?: unknown): Promise<unknown> => null),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock, convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: vi.fn(async () => ({})) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'time' in opts ? `${key}:${String(opts.time)}` : key,
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { aiStopKind, formatElapsed } from '@/lib/aiSource';
import { errorCodeOf } from '@/components/WordDialog/logic';
import { useStagedInsight } from '@/pages/celpip/hooks/useStagedInsight';
import { InsightError, type InsightProvider } from '@/pages/celpip/hooks/insightProviders';
import { SkillInsightPanel } from '@/pages/celpip/results/SkillInsightPanel';
import { AiTimeoutSetting } from '@/pages/settings/components/AiSettingsSection';
import type { InsightStatus } from '@/pages/celpip/types';

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async () => null);
});

describe('time limit and cancel codes', () => {
  it('reads AI_TIMEOUT / AI_CANCELLED from any error shape', () => {
    expect(aiStopKind('AI_TIMEOUT')).toBe('timeout');
    expect(aiStopKind(new InsightError('AI_CANCELLED'))).toBe('cancelled');
    expect(aiStopKind({ code: 'AI_TIMEOUT' })).toBe('timeout');
    expect(aiStopKind('OLLAMA_NOT_RUNNING')).toBeNull();
    expect(formatElapsed(65)).toBe('1:05');
    expect(formatElapsed(0)).toBe('0:00');
  });

  it('the word AI tab no longer reads AI_TIMEOUT as a network failure', () => {
    expect(errorCodeOf('AI_TIMEOUT')).toBe('AI_TIMEOUT');
    expect(errorCodeOf('AI_CANCELLED')).toBe('AI_CANCELLED');
  });
});

function provider(generate: InsightProvider['generate']): InsightProvider {
  const status: InsightStatus = {
    skills: {
      listening: 'pending',
      reading: 'pending',
      writing: 'not_taken',
      speaking: 'not_taken',
      summary: 'pending',
    },
    insight: {},
    taken_sections: ['listening', 'reading'],
  };
  return { origin: 'device', fetchStatus: async () => status, generate };
}

describe('staged exam insight on the user’s own AI', () => {
  it('a timeout stops the queue, says why, and Try again runs it again', async () => {
    const generate = vi.fn(async (skill: string) => {
      if (skill === 'listening' && generate.mock.calls.length === 1) throw new InsightError('AI_TIMEOUT');
      return { skill: skill as never, result: {} };
    });
    const p = provider(generate);
    const { result } = renderHook(() => useStagedInsight(p, true, 'listening'));

    await waitFor(() => expect(result.current.stopped).toBe('timeout'));
    expect(result.current.skillState('listening')).toBe('error');
    expect(result.current.stopKind('listening')).toBe('timeout');
    // Reading was queued behind it: it says so too, instead of spinning.
    expect(result.current.stopKind('reading')).toBe('timeout');
    // Reading would only wait out the same limit: nothing else starts by itself.
    await new Promise((r) => setTimeout(r, 30));
    expect(generate).toHaveBeenCalledTimes(1);

    act(() => result.current.retry('listening'));
    await waitFor(() => expect(generate.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(result.current.stopped).toBeNull();
  });

  it('shows the running request’s start time, and Cancel asks Rust to stop it', async () => {
    let release: () => void = () => {};
    const generate = vi.fn(
      () =>
        new Promise<{ skill: never; result: unknown }>((_, reject) => {
          release = () => reject(new InsightError('AI_CANCELLED'));
        }),
    );
    const p = provider(generate);
    const { result } = renderHook(() => useStagedInsight(p, true, 'listening'));
    await waitFor(() => expect(result.current.runningSkill).toBe('listening'));
    expect(typeof result.current.startedAt).toBe('number');

    act(() => result.current.cancel());
    expect(invokeMock).toHaveBeenCalledWith('ai_cancel_requests');
    act(() => release());
    await waitFor(() => expect(result.current.stopped).toBe('cancelled'));
    expect(result.current.startedAt).toBeNull();
  });
});

describe('insight panel', () => {
  const base = { skill: 'listening' as const, insight: {}, origin: 'device' as const };

  it('while running: elapsed time and a Cancel button, never a bare spinner', () => {
    const onCancel = vi.fn();
    render(
      <MemoryRouter>
        <SkillInsightPanel
          {...base}
          state="generating"
          onRetry={() => {}}
          wait={{ startedAt: Date.now() - 65_000, stopKind: null, onCancel }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('wait.elapsed:1:05')).toBeTruthy();
    expect(screen.getByText('wait.slowHint')).toBeTruthy();
    fireEvent.click(screen.getByText('wait.cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('after a timeout: the plain reason, a smaller-model hint, and Try again', () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <SkillInsightPanel
          {...base}
          state="error"
          onRetry={onRetry}
          wait={{ startedAt: null, stopKind: 'timeout', onCancel: () => {} }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('ai-stopped-timeout')).toBeTruthy();
    expect(screen.getByText('errors.AI_TIMEOUT')).toBeTruthy();
    expect(screen.getByText('wait.timeoutHint')).toBeTruthy();
    fireEvent.click(screen.getByText('wait.retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('time limit setting', () => {
  it('shows the stored limit and saves a new one where Rust reads it', async () => {
    invokeMock.mockImplementation(async (cmd: string) => (cmd === 'get_setting' ? '300' : null));
    render(<AiTimeoutSetting />);
    const select = (await screen.findByTestId('ai-timeout-select')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('300'));
    fireEvent.change(select, { target: { value: '600' } });
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('set_setting', {
        key: 'ai_request_timeout_sec',
        value: '600',
      }),
    );
  });
});
