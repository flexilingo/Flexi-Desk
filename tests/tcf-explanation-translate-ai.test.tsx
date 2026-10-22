import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const invoke = vi.fn();
const cloud = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: (...a: unknown[]) => cloud(...a) }));
vi.mock('@/pages/celpip/components/session/WordLookup', () => ({
  LookupText: ({ text }: { text: string }) => <span>{text}</span>,
}));

import '@/i18n/config';
import i18n from 'i18next';
import { TcfMcqExplanationBlock } from '@/pages/celpip/results/TcfExplanations';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAiSourceStore } from '@/stores/aiSourceStore';
import { useOllamaStore } from '@/stores/ollamaStore';

const entry = (id: string) => ({
  part_id: id,
  why_correct: 'The speaker says the meeting moved.',
  how_to_spot_next_time: 'Listen for the time change.',
  can_translate: true,
}) as never;

function world(o: { engine?: boolean; cloud?: boolean; pro?: boolean }) {
  useAuthStore.setState({
    session: o.cloud ? { access_token: 't', refresh_token: 'r', user_id: 'u1', email: 'a@b.c', expires_at: 9999999999 } : null,
    isLoading: false,
  });
  useSubscriptionStore.setState({
    subscription: o.pro ? { tier: 'pro', planId: 'p', status: 'active', periodStart: '', periodEnd: '', hasStripeSubscription: true } : null,
    hasResolved: true,
  });
  useAiSourceStore.setState({ loaded: true, provider: 'ollama', model: null, baseUrl: '', hasKey: false, cloudOptIn: !!o.cloud });
  useOllamaStore.setState({
    isConnected: !!o.engine,
    installStatus: { isInstalled: !!o.engine, binaryPath: null, isManaged: true, isSystemInstall: false, isServeRunning: !!o.engine, platform: 'macos', arch: 'aarch64' },
    installedModels: o.engine ? [{ name: 'llama3.2:latest', size: 1, digest: 'd', modifiedAt: '' }] : [],
    error: null,
  });
}

const view = (id: string) =>
  render(<TcfMcqExplanationBlock entry={entry(id)} sectionType="listening" userChoice={undefined} questionIndex={0} />);
const press = () => fireEvent.click(screen.getByRole('button', { name: new RegExp(i18n.t('exam:results.tcfHelp.translate')) }));

beforeEach(async () => {
  cleanup();
  invoke.mockReset();
  cloud.mockReset();
  await i18n.changeLanguage('fr');
});

describe('TCF explanation translation follows the AI policy', () => {
  it('translates with the learner\'s own AI by default, never the server', async () => {
    world({ engine: true });
    invoke.mockImplementation(async (cmd: string) =>
      cmd === 'ai_translate_texts' ? { why_correct: 'Le locuteur dit que la reunion a bouge.', how_to_spot_next_time: 'Ecoutez.' } : null,
    );
    view('a');
    press();
    await waitFor(() => expect(screen.getByText(/reunion a bouge/)).toBeTruthy());
    const call = invoke.mock.calls.find((c) => c[0] === 'ai_translate_texts');
    expect(call?.[1]).toMatchObject({ targetLang: 'fr', texts: { why_correct: 'The speaker says the meeting moved.' } });
    expect(cloud).not.toHaveBeenCalled();
  });

  it('shows the setup card, and calls nothing, when the AI is not set up', async () => {
    world({});
    view('b');
    press();
    await waitFor(() => expect(screen.getByText(new RegExp(i18n.t('ai:setup.title', )))).toBeTruthy());
    expect(invoke.mock.calls.some((c) => c[0] === 'ai_translate_texts')).toBe(false);
    expect(cloud).not.toHaveBeenCalled();
  });

  it('uses the server only when the learner opted into cloud AI on a paid plan', async () => {
    world({ engine: true, cloud: true, pro: true });
    cloud.mockResolvedValue({ texts: { why_correct: 'Traduit par le serveur.' } });
    view('c');
    press();
    await waitFor(() => expect(screen.getByText(/Traduit par le serveur/)).toBeTruthy());
    expect(cloud.mock.calls[0][1]).toBe('/exam?action=translate_explanation');
    expect(invoke.mock.calls.some((c) => c[0] === 'ai_translate_texts')).toBe(false);
  });
});
