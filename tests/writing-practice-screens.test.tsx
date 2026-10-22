import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

type Row = Record<string, unknown>;
const invoke = vi.fn();
const supabaseCall = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: (...a: unknown[]) => supabaseCall(...a) }));

import '@/i18n/config';
import i18n from 'i18next';
import { WritingPracticePage } from '@/pages/writing-practice';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAiSourceStore } from '@/stores/aiSourceStore';
import { useOllamaStore } from '@/stores/ollamaStore';

const SIGNED_IN = { access_token: 't', refresh_token: 'r', user_id: 'u1', email: 'test@example.com', expires_at: 9999999999 };

function world(o: { cloud?: boolean; engineRunning?: boolean }) {
  useAuthStore.setState({ session: o.cloud ? SIGNED_IN : null, isLoading: false });
  useSubscriptionStore.setState({
    subscription: o.cloud ? { tier: 'pro', planId: 'p', status: 'active', periodStart: '', periodEnd: '', hasStripeSubscription: true } : null,
    hasResolved: true,
  });
  useAiSourceStore.setState({ loaded: true, provider: 'ollama', model: null, baseUrl: '', hasKey: false, cloudOptIn: !!o.cloud });
  useOllamaStore.setState({
    isConnected: !!o.engineRunning,
    installStatus: { isInstalled: !!o.engineRunning, binaryPath: null, isManaged: true, isSystemInstall: false, isServeRunning: !!o.engineRunning, platform: 'macos', arch: 'aarch64' },
    installedModels: o.engineRunning ? [{ name: 'llama3.2:latest', size: 1, digest: 'd', modifiedAt: '' }] : [],
    error: null,
  });
}

const prompt = { id: 'p1', exam_type: 'celpip', topic: 'Office schedule', prompt_text: 'Write an email.', source: 'ai', is_active: true, usage_count: 0, created_at: '' };
const base = (o: Row): Row => ({
  id: 'local-1', user_id: 'local', exam_type: 'celpip', status: 'active', essay_text: '', word_count: 0,
  time_limit_seconds: 1620, time_spent_seconds: 0, timer_enabled: true, started_at: new Date().toISOString(),
  created_at: new Date().toISOString(), prompt, ...o,
});

let store: Record<string, Row> = {};
function backend(extra: Record<string, (args: Row) => unknown> = {}) {
  invoke.mockImplementation(async (cmd: string, args: Row = {}) => {
    if (extra[cmd]) return extra[cmd](args);
    switch (cmd) {
      case 'wp_history': return { sessions: Object.values(store).filter((s) => s.status === 'graded'), total: 0, all_total: Object.keys(store).length };
      case 'wp_get_active': return Object.values(store).find((s) => s.status === 'active') ?? null;
      case 'wp_get_session': return store[args.id as string];
      case 'wp_save_draft': store[args.sessionId as string] = { ...store[args.sessionId as string], essay_text: args.essayText }; return null;
      case 'wp_generate_prompt': return prompt;
      case 'wp_create_session': { const s = base({ id: 'local-new' }); store['local-new'] = s; return { session_id: 'local-new', session: s, prompt }; }
      default: return null;
    }
  });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/writing-practice/*" element={<WritingPracticePage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(async () => {
  cleanup();
  invoke.mockReset();
  supabaseCall.mockReset();
  supabaseCall.mockResolvedValue(null);
  store = {};
  await i18n.changeLanguage('en');
});
afterEach(() => vi.useRealTimers());

describe('landing', () => {
  it('local mode: no usage meter, 13 exam cards, the resume card for an active session', async () => {
    world({ engineRunning: true });
    store['local-1'] = base({ essay_text: 'draft' });
    backend();
    renderAt('/writing-practice');
    expect(await screen.findByText('Active Session')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resume/ })).toBeInTheDocument();
    expect(screen.getByText('IELTS Task 1')).toBeInTheDocument();
    expect(screen.queryByText(/sessions remaining/)).toBeNull();
    expect(supabaseCall).not.toHaveBeenCalled();
  });

  it('cloud mode: the monthly meter is shown and cloud sessions are labelled', async () => {
    world({ cloud: true });
    backend();
    supabaseCall.mockImplementation(async (_m: string, path: string) => {
      if (path.includes('check-usage')) return { allowed: true, used: 2, limit: 5, remaining: 3, isUnlimited: false, limitType: 'monthly' };
      if (path.includes('action=history'))
        return { sessions: [base({ id: 'cloud-uuid', status: 'graded', overall_score: 9, graded_at: new Date().toISOString(), word_count: 120 })], total: 1 };
      return null;
    });
    renderAt('/writing-practice');
    expect(await screen.findByText('3 sessions remaining this month')).toBeInTheDocument();
    expect(await screen.findByText('Cloud')).toBeInTheDocument();
  });

  it('cloud mode: the limit-reached state replaces the start', async () => {
    world({ cloud: true });
    backend();
    supabaseCall.mockImplementation(async (m: string, path: string) => {
      if (path.includes('check-usage')) return { allowed: false, used: 5, limit: 5, remaining: 0, isUnlimited: false };
      if (path.includes('generate-prompt')) return { id: 'sp' };
      if (path.includes('create-session'))
        throw JSON.stringify({ status: 429, error: 'MONTHLY_LIMIT_REACHED', code: '', data: { code: 'MONTHLY_LIMIT_REACHED', limitType: 'monthly', monthlyLimit: 5, dailyLimit: null } });
      return m === 'GET' ? { sessions: [], total: 0 } : null;
    });
    renderAt('/writing-practice');
    await screen.findByText('Limit reached');
    fireEvent.click(screen.getByText('CELPIP'));
    expect(await screen.findByText('Monthly limit reached')).toBeInTheDocument();
  });

  it('AI not set up: starting shows the setup card and calls nothing in the cloud', async () => {
    world({ engineRunning: false });
    backend({ wp_generate_prompt: () => { throw 'OLLAMA_NOT_RUNNING'; } });
    renderAt('/writing-practice');
    fireEvent.click(await screen.findByText('IELTS Task 1'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('wp_generate_prompt', expect.anything()));
    expect(await screen.findByRole('region', { name: 'Set up your AI' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(supabaseCall).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('wp_create_session', expect.anything());
  });
});

describe('editor', () => {
  it('shows the prompt with its chart description and counts words', async () => {
    world({ engineRunning: true });
    store['local-1'] = base({ prompt: { ...prompt, supplementary_data: { chart_description: 'Bars of data' } } });
    backend();
    renderAt('/writing-practice/local-1');
    expect(await screen.findByText('Office schedule')).toBeInTheDocument();
    expect(screen.getByText('Chart/Graph Description')).toBeInTheDocument();
    expect(screen.getByText('Bars of data')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Start writing your response here...'), { target: { value: 'one two three' } });
    expect(screen.getByText('3 / 20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit for Grading/ })).toBeDisabled();
  });

  it('autosaves three seconds after the last keystroke and the countdown follows the start time', async () => {
    world({ engineRunning: true });
    const startedAt = new Date(Date.now() - 600_000).toISOString(); // 10 minutes in
    store['local-1'] = base({ started_at: startedAt });
    backend();
    renderAt('/writing-practice/local-1');
    const box = await screen.findByPlaceholderText('Start writing your response here...');
    // 27 min limit, 10 min gone: 17:00 left (resume keeps counting)
    expect(screen.getByTestId('timer').textContent).toMatch(/^1[67]:\d\d$/);
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fireEvent.change(box, { target: { value: 'My draft' } });
    await act(async () => { vi.advanceTimersByTime(2900); });
    expect(invoke).not.toHaveBeenCalledWith('wp_save_draft', expect.anything());
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(invoke).toHaveBeenCalledWith('wp_save_draft', expect.objectContaining({ sessionId: 'local-1', essayText: 'My draft', wordCount: 2 }));
  });

  it('time up: the editor locks, submit is off and the stop message is offered', async () => {
    world({ engineRunning: true });
    store['local-1'] = base({ started_at: new Date(Date.now() - 2_000_000).toISOString() });
    backend();
    renderAt('/writing-practice/local-1');
    const box = await screen.findByPlaceholderText('Start writing your response here...');
    expect(box).toBeDisabled();
    expect(screen.getByRole('button', { name: /Submit for Grading/ })).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: "Time's up!" })[0]);
    expect(await screen.findByText(/won't be able to resume it/)).toBeInTheDocument();
  });

  it('submit keeps the essay and shows the setup card when the AI is not ready', async () => {
    world({ engineRunning: false });
    const essay = Array.from({ length: 25 }, (_, i) => `word${i}`).join(' ');
    store['local-1'] = base({ essay_text: essay, word_count: 25 });
    backend({ wp_submit: () => { throw 'OLLAMA_NOT_RUNNING'; } });
    renderAt('/writing-practice/local-1');
    fireEvent.click(await screen.findByRole('button', { name: /Submit for Grading/ }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('wp_submit', expect.objectContaining({ sessionId: 'local-1' })));
    expect(await screen.findByPlaceholderText('Start writing your response here...')).toHaveValue(essay);
    expect(screen.queryByText('Grading your essay...')).toBeNull();
  });
});

describe('graded view', () => {
  const graded = base({
    status: 'graded', overall_score: 7.5, essay_text: 'I has a dog.', word_count: 4, time_spent_seconds: 125,
    exam_type: 'ielts_task2', graded_at: new Date().toISOString(),
    criteria_scores: { 'Task Response': 7, 'Lexical Resource': 8 },
    ai_rewritten_version: 'I have a dog.',
    feedback: {
      summary: 'A clear essay.', strengths: ['Clear topic'], weaknesses: ['Verb forms'], suggestions: ['Review verbs'],
      error_highlights: [{ text: 'I has', correction: 'I have', type: 'grammar', explanation: 'Agreement', source: 'ai' }],
      vocabulary_analysis: { estimated_cefr: 'B1', lexical_diversity: 0.82, advanced_words: ['dog'], suggested_upgrades: [{ original: 'big', upgrade: 'enormous' }] },
      grading_meta: { model: 'llama3.2', quality: 'standard', double_graded: false, origin: 'device' },
    },
  });

  it('renders every section of a locally graded essay', async () => {
    world({ engineRunning: true });
    store['local-1'] = graded;
    backend();
    renderAt('/writing-practice/local-1');
    expect(await screen.findByText('Criteria Breakdown')).toBeInTheDocument();
    expect(screen.getByText('7.5')).toBeInTheDocument();
    expect(screen.getByText('Your own AI')).toBeInTheDocument();
    expect(screen.getByText('AI estimate — scores may differ from official exam results')).toBeInTheDocument();
    expect(screen.getByText('Vocabulary Analysis')).toBeInTheDocument();
    expect(screen.getByText('CEFR Level: B1')).toBeInTheDocument();
    expect(screen.getByText('Lexical Diversity: 82%')).toBeInTheDocument();
    expect(screen.getByText('enormous')).toBeInTheDocument();
    expect(screen.getByText('A clear essay.')).toBeInTheDocument();
    expect(screen.getByText('Clear topic')).toBeInTheDocument();
    fireEvent.click(screen.getByText('AI-Improved Version'));
    expect(screen.getByText('I have a dog.')).toBeInTheDocument();
  });

  it('a cloud grade shows the Pro badge and the double-checked mark', async () => {
    world({ cloud: true });
    backend();
    const cloudGraded = { ...graded, id: 'uuid-1', feedback: { ...(graded.feedback as Row), grading_meta: { model: 'm', quality: 'advanced', double_graded: true } } };
    supabaseCall.mockImplementation(async (_m: string, path: string) => (path.includes('get-session') ? cloudGraded : path.includes('check-usage') ? null : { sessions: [], total: 0 }));
    renderAt('/writing-practice/uuid-1');
    expect(await screen.findByText('FlexiLingo Pro')).toBeInTheDocument();
    expect(screen.getByText('Double-checked')).toBeInTheDocument();
  });

  it('a cloud session is not opened while cloud AI is off', async () => {
    world({ engineRunning: true });
    backend();
    renderAt('/writing-practice/uuid-1');
    expect(await screen.findByText('This session is in your FlexiLingo cloud')).toBeInTheDocument();
    expect(supabaseCall).not.toHaveBeenCalled();
  });
});
