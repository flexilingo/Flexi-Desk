import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import { useAuthStore } from '@/stores/authStore';
import { useOllamaStore } from '@/stores/ollamaStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import {
  OWN_KEY_DEFAULT_MODEL,
  cloudAiAllowed,
  resolveAiSource,
  type AiFacts,
  type AiProviderId,
  type AiSource,
} from '@/lib/aiSource';

/**
 * The user's AI choice, read from the same settings the Rust side reads
 * (`ai_provider`, `ai_model`, `<provider>_api_key`, `<provider>_base_url`), plus the
 * one switch that allows FlexiLingo's cloud AI (`ai_use_cloud`, off by default).
 */
interface AiSourceState {
  loaded: boolean;
  provider: AiProviderId;
  model: string | null;
  baseUrl: string;
  hasKey: boolean;
  cloudOptIn: boolean;

  /** Reads settings once; later calls are free. */
  ensureLoaded: () => Promise<void>;
  /** Re-reads settings and re-checks the on-device model. */
  refresh: () => Promise<void>;
  /** Re-checks only the on-device model (it can be started or stopped outside the app); throttled. */
  refreshLocal: () => Promise<void>;
  setCloudOptIn: (on: boolean) => Promise<void>;
  /** Saves a "my own key" setup (OpenAI, Anthropic, or an OpenAI-compatible address). */
  saveOwnKey: (input: {
    provider: Exclude<AiProviderId, 'ollama'>;
    apiKey: string;
    baseUrl: string;
    model: string;
  }) => Promise<void>;
  /** Points every feature at the model on this computer. */
  pointAtDevice: (model?: string) => Promise<void>;
}

const asProvider = (value: string | null): AiProviderId =>
  value === 'openai' || value === 'anthropic' ? value : 'ollama';

async function readSettings() {
  const provider = asProvider(await getSetting('ai_provider'));
  const [model, key, baseUrl, cloud] = await Promise.all([
    getSetting('ai_model'),
    getSetting(`${provider}_api_key`),
    getSetting(`${provider}_base_url`),
    getSetting('ai_use_cloud'),
  ]);
  const url = (baseUrl ?? '').trim();
  const hasKey =
    provider === 'ollama' ? false : !!(key ?? '').trim() || (provider === 'openai' && url !== '');
  return {
    provider,
    model: (model ?? '').trim() || null,
    baseUrl: provider === 'ollama' ? '' : url,
    hasKey,
    cloudOptIn: cloud === '1',
  };
}

let lastLocalCheck = 0;

export const useAiSourceStore = create<AiSourceState>()((set, get) => ({
  loaded: false,
  provider: 'ollama',
  model: null,
  baseUrl: '',
  hasKey: false,
  cloudOptIn: false,

  ensureLoaded: async () => {
    if (get().loaded) return;
    await get().refresh();
  },

  refresh: async () => {
    try {
      const next = await readSettings();
      set({ ...next, loaded: true });
    } catch {
      set({ loaded: true });
    }
    // Only probe the on-device model when that is the user's AI: checking it can
    // auto-select a model and must never overwrite a key-based provider's model.
    if (get().provider === 'ollama') {
      const ollama = useOllamaStore.getState();
      lastLocalCheck = Date.now();
      // Know the saved model first, or the first check would replace it with the first installed one.
      await ollama.loadSelectedModel();
      await Promise.all([ollama.checkInstallStatus(), ollama.checkConnection()]);
    }
  },

  refreshLocal: async () => {
    if (get().provider !== 'ollama' || Date.now() - lastLocalCheck < 8000) return;
    lastLocalCheck = Date.now();
    const ollama = useOllamaStore.getState();
    await ollama.loadSelectedModel();
    await Promise.all([ollama.checkInstallStatus(), ollama.checkConnection()]);
  },

  setCloudOptIn: async (on) => {
    await setSetting('ai_use_cloud', on ? '1' : '0');
    set({ cloudOptIn: on });
  },

  saveOwnKey: async ({ provider, apiKey, baseUrl, model }) => {
    await setSetting('ai_provider', provider);
    if (apiKey.trim()) await setSetting(`${provider}_api_key`, apiKey.trim());
    // An empty address means the provider's official one; the backend ignores blanks.
    await setSetting(`${provider}_base_url`, provider === 'openai' ? baseUrl.trim() : '');
    await setSetting('ai_model', model.trim() || OWN_KEY_DEFAULT_MODEL[provider]);
    await get().refresh();
  },

  pointAtDevice: async (model) => {
    await setSetting('ai_provider', 'ollama');
    if (model) await setSetting('ai_model', model);
    await get().refresh();
  },
}));

export interface UseAiSource {
  source: AiSource;
  /** The user's OWN AI alone, ignoring the cloud switch: what Settings and the setup card judge. */
  own: AiSource;
  /** True while a feature must wait before calling anything. */
  checking: boolean;
  /** Whether the user switched cloud AI on AND is entitled to it. */
  cloudActive: boolean;
  refresh: () => Promise<void>;
}

/**
 * The one hook every AI feature reads. Returns where this user's AI work runs and
 * whether it can run at all; never a silent cloud fallback.
 */
export function useAiSource(): UseAiSource {
  const store = useAiSourceStore();
  const signedIn = useAuthStore((s) => !!s.session);
  const subscription = useSubscriptionStore((s) => s.subscription);
  const tierKnown = useSubscriptionStore((s) => s.hasResolved);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);
  const installStatus = useOllamaStore((s) => s.installStatus);
  const isConnected = useOllamaStore((s) => s.isConnected);
  const installedModels = useOllamaStore((s) => s.installedModels);
  const checked = useOllamaStore((s) => s.installStatus !== null || s.error !== null);

  const { ensureLoaded, refresh, loaded, cloudOptIn } = store;
  useEffect(() => {
    void ensureLoaded().then(() => useAiSourceStore.getState().refreshLocal());
  }, [ensureLoaded]);
  useEffect(() => {
    if (loaded && cloudOptIn && signedIn && !tierKnown) void fetchSubscription();
  }, [loaded, cloudOptIn, signedIn, tierKnown, fetchSubscription]);

  const facts: AiFacts = useMemo(
    () => ({
      loaded,
      provider: store.provider,
      model: store.model,
      hasCredentials: store.hasKey,
      local: checked
        ? {
            installed: !!installStatus?.isInstalled || isConnected,
            running: isConnected,
            models: installedModels.map((m) => m.name),
          }
        : null,
      cloudOptIn,
      signedIn,
      tier: subscription?.tier,
      tierKnown,
    }),
    [
      loaded,
      store.provider,
      store.model,
      store.hasKey,
      checked,
      installStatus,
      isConnected,
      installedModels,
      cloudOptIn,
      signedIn,
      subscription?.tier,
      tierKnown,
    ],
  );

  const source = useMemo(() => resolveAiSource(facts), [facts]);
  const own = useMemo(() => resolveAiSource({ ...facts, cloudOptIn: false }), [facts]);
  return {
    source,
    own,
    checking: source.kind === 'checking',
    cloudActive: cloudAiAllowed(facts),
    refresh,
  };
}
