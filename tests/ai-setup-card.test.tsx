import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const settings: Record<string, string> = {};
const engine = { installed: false, running: false, models: [] as string[] };
const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));

import '@/i18n/config';
import i18n from 'i18next';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { useAiSourceStore } from '@/stores/aiSourceStore';
import { useOllamaStore } from '@/stores/ollamaStore';
import { useAuthStore } from '@/stores/authStore';

const installStatus = () => ({
  is_installed: engine.installed,
  binary_path: engine.installed ? '/x/ollama' : null,
  is_managed: true,
  is_system_install: false,
  is_serve_running: engine.running,
  platform: 'macos',
  arch: 'aarch64',
});

let aiTestError: string | null = null;

beforeEach(async () => {
  cleanup();
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(engine, { installed: false, running: false, models: [] });
  aiTestError = null;
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case 'get_setting':
        return settings[args!.key as string] ?? null;
      case 'set_setting':
        settings[args!.key as string] = args!.value as string;
        return null;
      case 'ollama_install_status':
        return installStatus();
      case 'ollama_status':
        return {
          connected: engine.running,
          version: engine.running ? '0.5' : null,
          base_url: 'http://localhost:11434',
          models: engine.models.map((name) => ({ name, size: 1, digest: 'd', modified_at: '' })),
        };
      case 'ollama_list_models':
        return engine.models.map((name) => ({ name, size: 1, digest: 'd', modified_at: '' }));
      case 'ollama_install':
        engine.installed = true;
        return null;
      case 'ollama_start_serve':
        engine.running = true;
        return null;
      case 'ollama_pull_model':
        engine.models = [`${args!.modelName}:latest`];
        return null;
      case 'ai_test':
        if (aiTestError) throw aiTestError;
        return { provider: 'openai', model: 'gpt-4o-mini', reply: 'ready' };
      default:
        return null;
    }
  });
  useAuthStore.setState({ session: null, isLoading: false });
  useAiSourceStore.setState({ loaded: false, provider: 'ollama', model: null, baseUrl: '', hasKey: false, cloudOptIn: false });
  useOllamaStore.setState({ isConnected: false, installedModels: [], installStatus: null, selectedModel: null, error: null });
  await i18n.changeLanguage('en');
});

describe('AI setup card', () => {
  it('one click installs, starts and downloads the model, then hands control back', async () => {
    const onReady = vi.fn();
    render(<AiSetupCard onReady={onReady} />);
    expect(await screen.findByText('The local AI engine is not installed on this computer yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Set up on this computer/ }));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(invoke).toHaveBeenCalledWith('ollama_install');
    expect(invoke).toHaveBeenCalledWith('ollama_start_serve');
    expect(invoke).toHaveBeenCalledWith('ollama_pull_model', { modelName: 'llama3.2' });
    expect(settings.ai_provider).toBe('ollama');
    expect(settings.ai_model).toBe('llama3.2:latest');
  });

  it('skips the steps already done: engine installed and running, only the model is missing', async () => {
    Object.assign(engine, { installed: true, running: true });
    const onReady = vi.fn();
    render(<AiSetupCard onReady={onReady} />);
    fireEvent.click(await screen.findByRole('button', { name: /Set up on this computer/ }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(invoke).not.toHaveBeenCalledWith('ollama_install');
    expect(invoke).not.toHaveBeenCalledWith('ollama_start_serve');
    expect(invoke).toHaveBeenCalledWith('ollama_pull_model', { modelName: 'llama3.2' });
  });

  it('"Use my own key" saves the key, tests it with a real prompt, then hands control back', async () => {
    const onReady = vi.fn();
    render(<AiSetupCard onReady={onReady} />);
    fireEvent.click(await screen.findByRole('button', { name: /Use my own key/ }));
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and test' }));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(settings.ai_provider).toBe('openai');
    expect(settings.openai_api_key).toBe('sk-test-123');
    expect(settings.openai_base_url).toBe('');
    expect(invoke).toHaveBeenCalledWith('ai_test');
  });

  it('an OpenAI-compatible server needs only its address', async () => {
    const onReady = vi.fn();
    render(<AiSetupCard onReady={onReady} />);
    fireEvent.click(await screen.findByRole('button', { name: /Use my own key/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Other (OpenAI-compatible)' }));
    fireEvent.change(screen.getByLabelText(/Server address/), { target: { value: 'http://localhost:1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and test' }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(settings.ai_provider).toBe('openai');
    expect(settings.openai_base_url).toBe('http://localhost:1234');
  });

  it('a rejected key stays inline, keeps the form, and does not continue', async () => {
    aiTestError = 'OpenAI error (401 Unauthorized): bad key';
    const onReady = vi.fn();
    render(<AiSetupCard onReady={onReady} />);
    fireEvent.click(await screen.findByRole('button', { name: /Use my own key/ }));
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and test' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The provider rejected this key');
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('does not re-fire the action when shown while the AI is already ready', async () => {
    settings.ai_provider = 'openai';
    settings.openai_api_key = 'sk-ok';
    const onReady = vi.fn();
    render(<AiSetupCard onReady={onReady} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('get_setting', { key: 'ai_provider' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onReady).not.toHaveBeenCalled();
  });
});
