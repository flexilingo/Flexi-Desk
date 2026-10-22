import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let local: Record<string, unknown> = {};
let failing = new Set<string>();
const invoke = vi.fn(async (command: string) => {
  if (failing.has(command)) throw 'BOOM';
  if (command in local) return local[command];
  switch (command) {
    case 'overview_get_activity':
      return { today: today(), days: [], current_streak: 0, longest_streak: 0, active_days: 0, xp_total: 0, xp_today: 0 };
    case 'overview_get_listening':
      return { minutes_30: 0, episodes_started: 0, followed: 0, in_progress: [], artwork: [] };
    case 'overview_get_words':
      return { total: 0, new_this_week: 0, cefr: {}, notes: 0 };
    case 'overview_refresh_achievements':
    case 'dashboard_list_goals':
      return [];
    case 'study_deck_status':
      return { decks: [] };
    case 'study_get_daily_plan':
      return { plan: { total_cards: 0, estimated_minutes: 1 } };
    case 'reader_list':
      return { items: [], total: 0 };
    case 'get_setting':
      return null;
    default:
      return { ok: true };
  }
});
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...(a as [string])), convertFileSrc: (p: string) => p }));

let cloud: (path: string, method: string) => unknown = () => ({});
const supabaseCall = vi.fn(async (method: string, path: string) => cloud(path, method));
vi.mock('@/lib/supabase', () => ({ supabaseCall: (...a: unknown[]) => supabaseCall(...(a as [string, string])) }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && !('defaultValue' in o) ? `${k}${JSON.stringify(o)}` : k),
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { OverviewPage } from '@/pages/dashboard/overview/OverviewPage';
import { useAuthStore } from '@/stores/authStore';

const session = { access_token: 't', refresh_token: 'r', user_id: 'u', email: 'amy@example.com', expires_at: 9999999999 };
const mount = () =>
  render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  local = {};
  failing = new Set();
  cloud = (path) => {
    if (path.startsWith('/user-settings')) return { exam_goal: 'celpip', exam_date: null, learning_language: 'en' };
    if (path.includes('action=gamification')) return { current_streak: 4, longest_streak: 9, level: 3 };
    if (path.includes('action=daily')) return [];
    if (path.includes('get_my_sessions')) return { sessions: [] };
    if (path.includes('announcements')) return { announcements: [] };
    return {};
  };
  invoke.mockClear();
  supabaseCall.mockClear();
  localStorage.clear();
  useAuthStore.setState({ session: null, isLoading: false });
});

describe('overview, signed out', () => {
  it('shows a skeleton, then the local parts and a sign-in hint, with no account call', async () => {
    mount();
    expect(screen.getByTestId('overview-skeleton')).toBeInTheDocument();
    expect(await screen.findByText('start.title')).toBeInTheDocument();
    expect(screen.getAllByText('examSignedOutTitle', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'signIn' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/greetingNoName/)).toBeInTheDocument();
    expect(screen.getByText('week.title')).toBeInTheDocument();
    expect(screen.getByText('allCaughtUp')).toBeInTheDocument();
    expect(supabaseCall).not.toHaveBeenCalled();
  });

  it('leads with due reviews and lists the due deck, from local data only', async () => {
    local.study_deck_status = {
      decks: [{ deck_id: 'd1', deck_title: 'Toronto words', total_cards: 20, mature_count: 5, untouched_count: 5, due_count: 7 }],
    };
    mount();
    expect(await screen.findByText(/review\.title\{"count":7\}/)).toBeInTheDocument();
    expect(screen.getAllByText('Toronto words').length).toBeGreaterThan(0);
    expect(supabaseCall).not.toHaveBeenCalled();
  });

  it('marks a failing card inline with a retry, without blanking the page', async () => {
    failing.add('overview_get_listening');
    mount();
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.getByText('week.title')).toBeInTheDocument();
    failing.clear();
    fireEvent.click(screen.getAllByRole('button', { name: 'retry' })[0]);
    await waitFor(() => expect(invoke.mock.calls.filter((c) => c[0] === 'overview_get_listening').length).toBeGreaterThan(1));
  });
});

describe('overview, signed in', () => {
  beforeEach(() => useAuthStore.setState({ session, isLoading: false }));

  it('reads the account, greets by name and leads with the exam practice', async () => {
    mount();
    expect(await screen.findByText(/practice\.title/)).toBeInTheDocument();
    expect(screen.getByText(/greeting\.(morning|afternoon|evening)\{"name":"amy"\}/)).toBeInTheDocument();
    expect(supabaseCall).toHaveBeenCalledWith('GET', '/user-settings');
    expect(screen.queryByText('examSignedOutTitle', { exact: false })).toBeNull();
  });

  it('asks which exam when none is set, and saves a TCF choice to the account without starting a practice', async () => {
    cloud = (path, method) => {
      if (path.startsWith('/user-settings')) return method === 'PATCH' ? { exam_goal: 'tcf' } : { exam_goal: null, exam_date: null };
      if (path.includes('action=gamification')) return { current_streak: 0, longest_streak: 0, level: 1 };
      return path.includes('announcements') ? { announcements: [] } : [];
    };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /nudgeCta/ }));
    fireEvent.click(screen.getAllByRole('radio')[1]);
    fireEvent.click(screen.getByRole('button', { name: /ctaSave/ }));
    await waitFor(() => expect(supabaseCall).toHaveBeenCalledWith('PATCH', '/user-settings', { exam_goal: 'tcf', exam_date: null }));
    expect(supabaseCall).not.toHaveBeenCalledWith('POST', '/exam?action=start_practice', expect.anything());
  });

  it('shows an announcement and keeps it closed after it is dismissed', async () => {
    cloud = (path) => {
      if (path.startsWith('/user-settings')) return { exam_goal: 'none', exam_date: null };
      if (path.includes('announcements'))
        return { announcements: [{ id: 'a1', slot: 'dashboard_banner', title: 'Hello', message: '<p>New <b>decks</b></p>', button_text: null, dismiss_type: 'button', auto_dismiss_seconds: 0 }] };
      if (path.includes('action=gamification')) return { current_streak: 0, longest_streak: 0, level: 1 };
      return [];
    };
    mount();
    expect(await screen.findByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('New decks')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }));
    expect(screen.queryByText('Hello')).toBeNull();
    expect(JSON.parse(localStorage.getItem('fl_dismissed_announcements') ?? '[]')).toEqual(['a1']);
  });
});
