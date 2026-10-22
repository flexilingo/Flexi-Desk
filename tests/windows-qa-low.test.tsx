import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Windows QA, the low ones: "Report a bug" is an in-app form posting to
 * /submit-feedback (W7); a failed update check is a translated sentence with
 * Try again, never the plugin's English (W8); the rating buttons show what the
 * scheduler will really do (W10).
 */

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { callMock, checkMock } = vi.hoisted(() => ({
  callMock: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({})),
  checkMock: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null), convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(async () => '0.7.0') }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: checkMock }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: callMock }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', exists: () => true, dir: () => 'ltr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { ReportBugDialog } from '@/components/feedback/ReportBugDialog';
import { reportProblem } from '@/components/feedback/reportBug';
import { useAuthStore } from '@/stores/authStore';
import { useUpdaterStore } from '@/stores/updaterStore';
import { UpdatesSection } from '@/pages/settings/components/UpdatesSection';
import { ratingIntervalLabels } from '@/pages/study/utils/srs-display';

beforeEach(() => {
  callMock.mockReset();
  callMock.mockImplementation(async () => ({ success: true }));
});

describe('report a bug, in the app', () => {
  it('checks the form against the server limits before sending', () => {
    const ok = { subject: 'Mic', message: 'The section never starts.', email: '', signedIn: true };
    expect(reportProblem(ok)).toBeNull();
    expect(reportProblem({ ...ok, subject: 'x' })).toBe('subject');
    expect(reportProblem({ ...ok, message: 'short' })).toBe('message');
    expect(reportProblem({ ...ok, signedIn: false, email: 'nope' })).toBe('email');
    expect(reportProblem({ ...ok, signedIn: false, email: 'learner@example.com' })).toBeNull();
  });

  it('posts to /submit-feedback and says it arrived; a failure keeps the form open', async () => {
    useAuthStore.setState({ session: { user_id: 'u', email: 'test@example.com' } as never, isLoading: false });
    render(<ReportBugDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('reportBug.subjectPlaceholder'), {
      target: { value: 'Speaking will not start' },
    });
    fireEvent.change(screen.getByPlaceholderText('reportBug.messagePlaceholder'), {
      target: { value: 'No microphone on this laptop, no way to skip.' },
    });

    callMock.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByText('reportBug.send'));
    expect(await screen.findByText('reportBug.sendFailed')).toBeTruthy();

    fireEvent.click(screen.getByText('reportBug.send'));
    await screen.findByTestId('report-sent');
    const [method, path, body] = callMock.mock.calls.at(-1)! as [string, string, Record<string, unknown>];
    expect(method).toBe('POST');
    expect(path).toBe('/submit-feedback');
    expect(body).toMatchObject({ type: 'bug', platform: 'desktop', subject: 'Speaking will not start' });
    expect(body.email).toBeUndefined(); // signed in: the account is the sender
  });
});

describe('update check', () => {
  it('a failed check shows a translated sentence and Try again, not the plugin text', async () => {
    useUpdaterStore.setState({ status: 'idle', version: null, error: null, failure: null });
    checkMock.mockRejectedValue(new Error('Could not fetch a valid release JSON from the remote'));
    await useUpdaterStore.getState().check();
    expect(useUpdaterStore.getState().failure).toBe('check');
    render(<UpdatesSection />);
    expect(screen.getByText('errors.check')).toBeTruthy();
    expect(screen.queryByText(/release JSON/)).toBeNull();
    checkMock.mockResolvedValue(null);
    fireEvent.click(screen.getByText('tryAgain'));
    await waitFor(() => expect(useUpdaterStore.getState().status).toBe('upToDate'));
  });
});

describe('rating buttons', () => {
  it("show the scheduler's own days for a new card", () => {
    // What Rust's predicted_intervals sends for a new FSRS card: Again/Hard keep it due.
    expect(ratingIntervalLabels({ '1': 0, '2': 0, '3': 2, '4': 2, '5': 6 }, 'fsrs', null)).toEqual({
      1: '<1d',
      2: '<1d',
      3: '2d',
      4: '2d',
      5: '6d',
    });
  });

  it('fall back to the formula for a response without predictions', () => {
    const labels = ratingIntervalLabels(undefined, 'leitner', null);
    expect(Object.keys(labels)).toHaveLength(5);
  });
});
