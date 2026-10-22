import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const invoke = vi.fn();
const captured: { origin?: string; enabled?: boolean } = {};

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: vi.fn(async () => ({})) }));
vi.mock('@/pages/celpip/hooks/useStagedInsight', () => ({
  useStagedInsight: (provider: { origin: string }, enabled: boolean) => {
    captured.origin = provider.origin;
    captured.enabled = enabled;
    return {
      skillState: () => 'pending',
      insight: {},
      progress: { done: 0, total: 0 },
      isStatusLoading: false,
      limitReached: false,
      retry: () => {},
      origin: provider.origin,
    };
  },
}));

import '@/i18n/config';
import i18n from 'i18next';
import { CelpipResultsPage } from '@/pages/celpip/components/CelpipResultsPage';
import { SentenceChatSheet } from '@/pages/podcast/components/SentenceChatSheet';
import { AiSettingsSection } from '@/pages/settings/components/AiSettingsSection';
import { useCelpipStore } from '@/pages/celpip/stores/celpipStore';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAiSourceStore } from '@/stores/aiSourceStore';
import { useOllamaStore } from '@/stores/ollamaStore';

const SIGNED_IN = { access_token: 't', refresh_token: 'r', user_id: 'u1', email: 'test@example.com', expires_at: 9999999999 };

function world(o: { signedIn?: boolean; tier?: string; cloud?: boolean; provider?: 'ollama' | 'openai'; hasKey?: boolean; engineRunning?: boolean }) {
  useAuthStore.setState({ session: o.signedIn ? SIGNED_IN : null, isLoading: false });
  useSubscriptionStore.setState({
    subscription: o.tier ? { tier: o.tier, planId: 'p', status: 'active', periodStart: '', periodEnd: '', hasStripeSubscription: true } : null,
    hasResolved: true,
  });
  useAiSourceStore.setState({
    loaded: true,
    provider: o.provider ?? 'ollama',
    model: null,
    baseUrl: '',
    hasKey: !!o.hasKey,
    cloudOptIn: !!o.cloud,
  });
  useOllamaStore.setState({
    isConnected: !!o.engineRunning,
    installStatus: { isInstalled: !!o.engineRunning, binaryPath: null, isManaged: true, isSystemInstall: false, isServeRunning: !!o.engineRunning, platform: 'macos', arch: 'aarch64' },
    installedModels: o.engineRunning ? [{ name: 'llama3.2:latest', size: 1, digest: 'd', modifiedAt: '' }] : [],
    error: null,
  });
}

function celpipResults() {
  useCelpipStore.setState({
    results: { session: { id: 's1', status: 'scoring' }, section_results: [] } as never,
    isResultsLoading: false,
    sessions: [],
    fetchResults: vi.fn(),
    fetchSessions: vi.fn(),
  } as never);
}

beforeEach(async () => {
  cleanup();
  invoke.mockReset();
  invoke.mockImplementation(async () => null);
  captured.origin = undefined;
  captured.enabled = undefined;
  await i18n.changeLanguage('en');
});

const results = () =>
  render(
    <MemoryRouter>
      <CelpipResultsPage sessionId="s1" />
    </MemoryRouter>,
  );

describe('CELPIP insight follows the policy', () => {
  it('defaults to the model on this device', () => {
    world({ engineRunning: true });
    celpipResults();
    results();
    expect(captured.origin).toBe('device');
  });

  it('uses the user\'s own key when that is their AI', () => {
    world({ provider: 'openai', hasKey: true });
    celpipResults();
    results();
    expect(captured.origin).toBe('own_key');
  });

  it('a paid plan alone does not send insight to the cloud', () => {
    world({ signedIn: true, tier: 'pro', engineRunning: true });
    celpipResults();
    results();
    expect(captured.origin).toBe('device');
  });

  it('goes to the cloud only when switched on, signed in and paid', () => {
    world({ signedIn: true, tier: 'pro', cloud: true, engineRunning: true });
    celpipResults();
    results();
    expect(captured.origin).toBe('cloud');
  });

  it('switched on while signed out stays on the user\'s own AI', () => {
    world({ cloud: true, engineRunning: true });
    celpipResults();
    results();
    expect(captured.origin).toBe('device');
  });

  it('not set up: never the cloud, even for a paid plan', () => {
    world({ signedIn: true, tier: 'pro', engineRunning: false });
    celpipResults();
    results();
    expect(captured.origin).not.toBe('cloud');
  });
});

describe('sentence chat', () => {
  const sheet = () =>
    render(
      <SentenceChatSheet
        open
        onClose={() => {}}
        episodeId="e1"
        sentence="Bonjour tout le monde."
      />,
    );

  it('shows the setup card when the user\'s AI is not set up, and does not call the model', async () => {
    world({ engineRunning: false });
    sheet();
    expect(await screen.findByText('Set up your AI')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('ai_sentence_chat', expect.anything());
  });

  it('shows no setup card when the AI is ready', () => {
    world({ provider: 'openai', hasKey: true });
    sheet();
    expect(screen.queryByText('Set up your AI')).toBeNull();
  });

  it('a setup error from the model turns into the setup card, not raw text', async () => {
    world({ provider: 'openai', hasKey: true });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'ai_sentence_chat') throw 'AI_KEY_MISSING';
      return null;
    });
    sheet();
    // Lena's opening choices come once the conversation so far has been read.
    fireEvent.click(await screen.findByRole('button', { name: /Translate/ }));
    expect(await screen.findByText('Set up your AI')).toBeInTheDocument();
    expect(screen.queryByText('AI_KEY_MISSING')).toBeNull();
  });
});

describe('Settings > AI', () => {
  it('the cloud switch is off by default and disabled when signed out', async () => {
    world({ provider: 'openai', hasKey: true });
    render(<AiSettingsSection />);
    const sw = await screen.findByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toBeDisabled();
    expect(screen.getByText('Sign in to a paid plan to switch this on.')).toBeInTheDocument();
  });

  it('a paid signed-in user can switch cloud AI on, and it is saved', async () => {
    world({ signedIn: true, tier: 'pro', provider: 'openai', hasKey: true });
    render(<AiSettingsSection />);
    const sw = await screen.findByRole('switch');
    expect(sw).not.toBeDisabled();
    fireEvent.click(sw);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('set_setting', { key: 'ai_use_cloud', value: '1' }));
    expect(await screen.findByText('Active for word analysis and exam insights.')).toBeInTheDocument();
  });

  it('the test button sends one real tiny prompt and reports the answer', async () => {
    world({ provider: 'openai', hasKey: true });
    invoke.mockImplementation(async (cmd: string) =>
      cmd === 'ai_test' ? { provider: 'openai', model: 'gpt-4o-mini', reply: 'ready' } : null,
    );
    render(<AiSettingsSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
    expect(await screen.findByText(/It works\. gpt-4o-mini answered: ready/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('ai_test');
  });

  it('not set up: the status says so and the setup card is offered', async () => {
    world({ engineRunning: false });
    render(<AiSettingsSection />);
    expect(await screen.findByText('Set up your AI')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
  });
});
