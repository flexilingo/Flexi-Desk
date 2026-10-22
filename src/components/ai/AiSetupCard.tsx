import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AlertTriangle, Cpu, KeyRound, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useOllamaStore } from '@/stores/ollamaStore';
import { useAiSource, useAiSourceStore } from '@/stores/aiSourceStore';
import {
  OWN_KEY_DEFAULT_MODEL,
  RECOMMENDED_LOCAL_MODEL,
  type AiNotReadyReason,
} from '@/lib/aiSource';
import {
  mapOllamaInstallProgress,
  mapOllamaPullProgress,
  type RawOllamaInstallProgress,
  type RawOllamaPullProgress,
} from '@/stores/ollamaTypes';
import { aiErrorText } from './aiErrorText';

/** Keeps the shared store's progress in step with the installer and the model download. */
function useOllamaProgressEvents() {
  const setPullProgress = useOllamaStore((s) => s.setPullProgress);
  const setInstallProgress = useOllamaStore((s) => s.setInstallProgress);
  useEffect(() => {
    const pull = listen<RawOllamaPullProgress>('ollama-pull-progress', (e) =>
      setPullProgress(mapOllamaPullProgress(e.payload)),
    );
    const install = listen<RawOllamaInstallProgress>('ollama-install-progress', (e) =>
      setInstallProgress(mapOllamaInstallProgress(e.payload)),
    );
    return () => {
      void pull.then((off) => off());
      void install.then((off) => off());
    };
  }, [setPullProgress, setInstallProgress]);
}

function Progress({ percent, label }: { percent: number | null; label: string }) {
  return (
    <div className="space-y-1.5" role="status">
      <p className="m-0 text-xs text-muted-foreground">{label}</p>
      <progress
        max={100}
        value={percent == null ? undefined : Math.max(3, Math.min(100, percent))}
        className="block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-accent"
      />
    </div>
  );
}

type KeyProvider = 'openai' | 'anthropic' | 'compatible';

interface Props {
  /** Why the card is showing; shown as its first line. Defaults to a generic line. */
  reason?: AiNotReadyReason;
  /** Called once, after the user's AI answered a real test. The action that needed AI proceeds here. */
  onReady?: () => void;
  /** Tighter layout for dialogs and side sheets. */
  compact?: boolean;
  className?: string;
}

/**
 * "Set up your AI": the one place every AI feature sends a user whose own AI is not
 * ready. Two easy paths - install the model on this computer in one click, or paste
 * your own key (OpenAI, Anthropic, or any OpenAI-compatible address). It never
 * offers FlexiLingo's cloud as a stand-in; that is a separate, explicit setting.
 */
export function AiSetupCard({ reason, onReady, compact = false, className }: Props) {
  const { t } = useTranslation('ai');
  useOllamaProgressEvents();
  const { own: source, refresh } = useAiSource();
  const saveOwnKey = useAiSourceStore((s) => s.saveOwnKey);
  const pointAtDevice = useAiSourceStore((s) => s.pointAtDevice);

  const isInstalling = useOllamaStore((s) => s.isInstalling);
  const isStartingServe = useOllamaStore((s) => s.isStartingServe);
  const isPulling = useOllamaStore((s) => s.isPulling);
  const installProgress = useOllamaStore((s) => s.installProgress);
  const pullProgress = useOllamaStore((s) => s.pullProgress);

  // The user may start the engine outside the app; look again when they come back.
  const refreshLocal = useAiSourceStore((s) => s.refreshLocal);
  useEffect(() => {
    const onFocus = () => void refreshLocal();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshLocal]);

  const [mode, setMode] = useState<'choose' | 'key'>('choose');
  const [busy, setBusy] = useState<'local' | 'key' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [keyProvider, setKeyProvider] = useState<KeyProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');

  // Setup finished (here or anywhere else): hand control back exactly once.
  // Armed only once the user's AI was seen NOT ready or the user ran a setup here,
  // so a card shown for some other failure never re-fires the action in a loop.
  const fired = useRef(false);
  const armed = useRef(false);
  // A setup run here that failed (e.g. a rejected key) must not count as "ready".
  const blocked = useRef(false);
  useEffect(() => {
    if (source.kind === 'unconfigured') armed.current = true;
    if (
      source.kind === 'own' &&
      armed.current &&
      !fired.current &&
      !blocked.current &&
      busy === null
    ) {
      fired.current = true;
      onReady?.();
    }
  }, [source.kind, busy, onReady]);

  const shownReason = reason ?? (source.kind === 'unconfigured' ? source.reason : undefined);
  const lowPower =
    typeof navigator !== 'undefined' &&
    navigator.hardwareConcurrency > 0 &&
    navigator.hardwareConcurrency <= 4;

  /** A setup run here passed its check: hand control back, once. */
  const finish = () => {
    if (fired.current) return;
    fired.current = true;
    onReady?.();
  };

  const runLocalSetup = async () => {
    blocked.current = false;
    setBusy('local');
    setError(null);
    const ollama = useOllamaStore.getState;
    try {
      await ollama().checkInstallStatus();
      if (!ollama().installStatus?.isInstalled)
        await ollama().installOllama(); // also starts the server
      else if (!ollama().isConnected) await ollama().startServe();
      if (!ollama().isConnected) throw new Error(ollama().error ?? 'OLLAMA_NOT_RUNNING');

      if (ollama().installedModels.length === 0) {
        await ollama().pullModel(RECOMMENDED_LOCAL_MODEL);
        if (ollama().installedModels.length === 0)
          throw new Error(ollama().error ?? 'OLLAMA_MODEL_MISSING');
      }
      const names = ollama().installedModels.map((m) => m.name);
      const pick =
        names.find((n) => n.replace(/:latest$/, '') === RECOMMENDED_LOCAL_MODEL) ?? names[0];
      await ollama().selectModel(pick);
      await pointAtDevice(pick);
      finish();
    } catch (err) {
      blocked.current = true;
      setError(aiErrorText(t, err));
    } finally {
      setBusy(null);
    }
  };

  const runKeySetup = async () => {
    blocked.current = false;
    setBusy('key');
    setError(null);
    try {
      const provider = keyProvider === 'compatible' ? 'openai' : keyProvider;
      await saveOwnKey({
        provider,
        apiKey,
        baseUrl: keyProvider === 'compatible' ? baseUrl : '',
        model:
          model ||
          (keyProvider === 'anthropic'
            ? OWN_KEY_DEFAULT_MODEL.anthropic
            : OWN_KEY_DEFAULT_MODEL.openai),
      });
      // A real tiny prompt: a typo in the key shows up here, not in the middle of a feature.
      await invoke('ai_test');
      await refresh();
      finish();
    } catch (err) {
      blocked.current = true;
      setError(aiErrorText(t, err));
    } finally {
      setBusy(null);
    }
  };

  const keyReady =
    keyProvider === 'compatible' ? baseUrl.trim().length > 0 : apiKey.trim().length > 0;

  const localLabel = isInstalling
    ? t('setup.installing')
    : isStartingServe
      ? t('setup.starting')
      : isPulling
        ? t('setup.downloading', { model: RECOMMENDED_LOCAL_MODEL })
        : t('setup.working');
  const localPercent = isInstalling
    ? (installProgress?.percent ?? null)
    : isPulling
      ? (pullProgress?.percent ?? null)
      : null;

  return (
    <section
      className={cn('rounded-xl border border-border bg-card p-5 text-start shadow-xs', className)}
      aria-label={t('setup.title')}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="m-0 text-[15px] font-semibold text-foreground">{t('setup.title')}</h3>
          <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
            {shownReason ? t(`reason.${shownReason}`) : t('setup.intro')}
          </p>
          {!compact && (
            <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
              {t('setup.own')}
            </p>
          )}
        </div>
      </div>

      {busy === 'local' && (
        <div className="mt-4">
          <Progress percent={localPercent} label={localLabel} />
        </div>
      )}

      {mode === 'choose' && busy !== 'local' && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="accent" onClick={() => void runLocalSetup()} disabled={busy !== null}>
              <Cpu />
              {t('setup.deviceButton')}
            </Button>
            <Button variant="outline" onClick={() => setMode('key')} disabled={busy !== null}>
              <KeyRound />
              {t('setup.keyButton')}
            </Button>
          </div>
          <p className="m-0 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            {lowPower && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />}
            <span>{lowPower ? t('setup.weakMachine') : t('setup.deviceHint')}</span>
          </p>
        </div>
      )}

      {mode === 'key' && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (keyReady) void runKeySetup();
          }}
        >
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={t('setup.provider')}
          >
            {(['openai', 'anthropic', 'compatible'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={keyProvider === p}
                onClick={() => setKeyProvider(p)}
                className={cn(
                  'inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium transition-colors',
                  keyProvider === p
                    ? 'border-accent bg-accent/10 text-foreground'
                    : 'border-input bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`setup.providers.${p}`)}
              </button>
            ))}
          </div>

          {keyProvider === 'compatible' && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">{t('setup.baseUrl')}</span>
              <Input
                dir="ltr"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:1234"
                autoComplete="off"
              />
              <span className="block text-[11px] text-muted-foreground">
                {t('setup.baseUrlHint')}
              </span>
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">
              {keyProvider === 'compatible' ? t('setup.keyOptional') : t('setup.key')}
            </span>
            <Input
              dir="ltr"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
              autoComplete="off"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">{t('setup.model')}</span>
            <Input
              dir="ltr"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={
                keyProvider === 'anthropic'
                  ? OWN_KEY_DEFAULT_MODEL.anthropic
                  : OWN_KEY_DEFAULT_MODEL.openai
              }
              autoComplete="off"
            />
          </label>

          <p className="m-0 text-[11px] leading-relaxed text-muted-foreground">
            {t('setup.keyPrivacy')}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="accent" loading={busy === 'key'}>
              {t('setup.saveAndTest')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode('choose')}
              disabled={busy !== null}
            >
              {t('setup.back')}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="m-0 mt-3 rounded-md border border-error/30 bg-error/[0.06] px-3 py-2 text-[13px] text-error"
        >
          {error}
        </p>
      )}
    </section>
  );
}
