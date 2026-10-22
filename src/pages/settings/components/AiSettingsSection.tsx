import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Brain, CheckCircle2, Cloud, Cpu, KeyRound, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { aiErrorText } from '@/components/ai/aiErrorText';
import { OllamaModelManager } from '@/pages/settings/components/OllamaModelManager';
import { useAuthStore } from '@/stores/authStore';
import { useOllamaStore } from '@/stores/ollamaStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAiSource, useAiSourceStore } from '@/stores/aiSourceStore';
import {
  AI_TIMEOUT_OPTIONS_SEC,
  AI_TIMEOUT_SETTING,
  DEFAULT_AI_TIMEOUT_SEC,
  isCloudTier,
} from '@/lib/aiSource';
import { cn } from '@/lib/utils';

interface TestResult {
  provider: string;
  model: string;
  reply: string;
}

/** Settings > AI: which AI desk uses (the user's own), whether it works, and the one cloud opt-in. */
export function AiSettingsSection() {
  const { t } = useTranslation('ai');
  const { own: source, cloudActive, refresh } = useAiSource();
  const provider = useAiSourceStore((s) => s.provider);
  const model = useAiSourceStore((s) => s.model);
  const baseUrl = useAiSourceStore((s) => s.baseUrl);
  const cloudOptIn = useAiSourceStore((s) => s.cloudOptIn);
  const setCloudOptIn = useAiSourceStore((s) => s.setCloudOptIn);

  const signedIn = useAuthStore((s) => !!s.session);
  const tier = useSubscriptionStore((s) => s.subscription?.tier);
  const tierKnown = useSubscriptionStore((s) => s.hasResolved);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);
  useEffect(() => {
    if (signedIn && !tierKnown) void fetchSubscription();
  }, [signedIn, tierKnown, fetchSubscription]);

  const installedModels = useOllamaStore((s) => s.installedModels);
  const selectModel = useOllamaStore((s) => s.selectModel);

  const [changing, setChanging] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<
    { ok: true; result: TestResult } | { ok: false; message: string } | null
  >(null);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const ownReady = source.kind === 'own';
  const entitled = signedIn && isCloudTier(tier);

  const statusText = (() => {
    if (source.kind === 'checking') return t('settings.status.checking');
    if (source.kind === 'unconfigured') return t(`reason.${source.reason}`);
    if (provider === 'ollama') return t('settings.status.device', { model: model ?? '' });
    if (provider === 'anthropic') return t('settings.status.anthropic', { model: model ?? '' });
    return baseUrl
      ? t('settings.status.compatible', { url: baseUrl, model: model ?? '' })
      : t('settings.status.openai', { model: model ?? '' });
  })();

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const result = await invoke<TestResult>('ai_test');
      setTest({ ok: true, result });
    } catch (err) {
      setTest({ ok: false, message: aiErrorText(t, err) });
    } finally {
      setTesting(false);
    }
  };

  const toggleCloud = async (on: boolean) => {
    setCloudSaving(true);
    setCloudError(null);
    try {
      await setCloudOptIn(on);
    } catch (err) {
      setCloudError(aiErrorText(t, err));
    } finally {
      setCloudSaving(false);
    }
  };

  const cloudHint = !signedIn
    ? t('settings.cloudNeedsSignIn')
    : !tierKnown
      ? null
      : !entitled
        ? t('settings.cloudNeedsPaid')
        : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Brain className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="m-0 text-base font-semibold text-foreground">{t('settings.title')}</h2>
            <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
              {t('settings.explain')}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <span
            className={cn(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              ownReady
                ? 'bg-success'
                : source.kind === 'checking'
                  ? 'bg-muted-foreground/40'
                  : 'bg-warning',
            )}
            aria-hidden="true"
          />
          <p className="m-0 min-w-0 flex-1 text-sm text-foreground" dir="auto">
            {ownReady && provider === 'ollama' ? (
              <Cpu className="me-1.5 inline h-4 w-4 text-muted-foreground" />
            ) : null}
            {ownReady && provider !== 'ollama' ? (
              <KeyRound className="me-1.5 inline h-4 w-4 text-muted-foreground" />
            ) : null}
            {statusText}
          </p>
          {ownReady && (
            <Button variant="outline" size="sm" loading={testing} onClick={() => void runTest()}>
              <PlayCircle />
              {t('settings.test')}
            </Button>
          )}
        </div>

        {test && (
          <p
            role={test.ok ? 'status' : 'alert'}
            className={cn(
              'm-0 mt-3 rounded-md border px-3 py-2 text-[13px]',
              test.ok
                ? 'border-success/40 bg-success/10 text-foreground'
                : 'border-error/30 bg-error/[0.06] text-error',
            )}
          >
            {test.ok ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {t('settings.testOk', { model: test.result.model, reply: test.result.reply })}
              </span>
            ) : (
              test.message
            )}
          </p>
        )}

        {ownReady && provider === 'ollama' && installedModels.length > 0 && (
          <label className="mt-4 block space-y-1">
            <span className="text-xs font-medium text-foreground">{t('settings.modelPicker')}</span>
            <select
              dir="ltr"
              value={
                installedModels.find(
                  (m) => m.name.replace(/:latest$/, '') === (model ?? '').replace(/:latest$/, ''),
                )?.name ?? ''
              }
              onChange={(e) => void selectModel(e.target.value).then(() => refresh())}
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs focus-visible:border-accent/60 focus-visible:outline-none"
            >
              {installedModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {ownReady && <AiTimeoutSetting />}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {ownReady && provider === 'ollama' && (
            <Button variant="ghost" size="sm" onClick={() => setShowModels((v) => !v)}>
              {showModels ? t('settings.hideModels') : t('settings.manageModels')}
            </Button>
          )}
          {ownReady && (
            <Button variant="ghost" size="sm" onClick={() => setChanging((v) => !v)}>
              {changing ? t('settings.cancelChange') : t('settings.change')}
            </Button>
          )}
        </div>

        {ownReady && provider === 'ollama' && showModels && (
          <div className="mt-4">
            <OllamaModelManager />
          </div>
        )}
      </section>

      {(!ownReady && source.kind !== 'checking') || changing ? (
        <AiSetupCard
          onReady={() => {
            setChanging(false);
            setTest(null);
          }}
        />
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Cloud className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="ai-cloud-label" className="m-0 text-[15px] font-semibold text-foreground">
                {t('settings.cloudTitle')}
              </h3>
              <Switch
                aria-labelledby="ai-cloud-label"
                checked={cloudOptIn}
                disabled={cloudSaving || (!cloudOptIn && !entitled)}
                onCheckedChange={(on) => void toggleCloud(on)}
              />
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
              {t('settings.cloudDesc')}
            </p>
            {cloudHint && <p className="m-0 text-xs text-muted-foreground">{cloudHint}</p>}
            {cloudOptIn && !cloudActive && entitled === false && tierKnown && (
              <p className="m-0 text-xs text-warning">{t('settings.cloudInactive')}</p>
            )}
            {cloudActive && <p className="m-0 text-xs text-success">{t('settings.cloudActive')}</p>}
            {cloudError && (
              <p role="alert" className="m-0 text-xs text-error">
                {cloudError}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * How long one answer from the user's own AI may take before it is stopped (Rust
 * reads the same setting). A slow computer may need more; nothing waits forever.
 */
export function AiTimeoutSetting() {
  const { t } = useTranslation('ai');
  const [value, setValue] = useState<number>(DEFAULT_AI_TIMEOUT_SEC);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    invoke<string | null>('get_setting', { key: AI_TIMEOUT_SETTING })
      .then((v) => {
        const n = Number(v);
        if (alive && Number.isFinite(n) && n > 0) setValue(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const save = async (secs: number) => {
    const previous = value;
    setValue(secs);
    setFailed(false);
    try {
      await invoke('set_setting', { key: AI_TIMEOUT_SETTING, value: String(secs) });
    } catch {
      setValue(previous);
      setFailed(true);
    }
  };

  const options: number[] = (AI_TIMEOUT_OPTIONS_SEC as readonly number[]).includes(value)
    ? [...AI_TIMEOUT_OPTIONS_SEC]
    : [...AI_TIMEOUT_OPTIONS_SEC, value].sort((a, b) => a - b);

  return (
    <label className="mt-4 block space-y-1">
      <span className="text-xs font-medium text-foreground">{t('settings.timeoutLabel')}</span>
      <select
        data-testid="ai-timeout-select"
        value={value}
        onChange={(e) => void save(Number(e.target.value))}
        className="flex h-9 w-full max-w-xs rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs focus-visible:border-accent/60 focus-visible:outline-none"
      >
        {options.map((secs) => (
          <option key={secs} value={secs}>
            {t('settings.timeoutMinutes', { count: Math.round(secs / 60) })}
          </option>
        ))}
      </select>
      <span className="block text-[12px] leading-relaxed text-muted-foreground">
        {t('settings.timeoutHint')}
      </span>
      {failed && (
        <span role="alert" className="block text-[12px] text-error">
          {t('settings.timeoutSaveFailed')}
        </span>
      )}
    </label>
  );
}
