import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { setSetting } from '@/lib/tauri-bridge';
import { useCaptionStore } from '@/pages/caption/stores/captionStore';
import { useDiscoverStore } from '@/pages/podcast/stores/discoverStore';
import {
  type RawDownloadProgress as RawWhisperDownloadProgress,
  mapDownloadProgress as mapWhisperDownloadProgress,
} from '@/pages/caption/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type OllamaInstallStatus,
  type OllamaInstallProgress,
  type OllamaPullProgress,
  type RawOllamaInstallStatus,
  type RawOllamaInstallProgress,
  type RawOllamaPullProgress,
  type RawOllamaStatus,
  mapOllamaInstallStatus,
  mapOllamaInstallProgress,
  mapOllamaPullProgress,
  mapOllamaStatus,
  RECOMMENDED_OLLAMA_MODELS,
} from '@/stores/ollamaTypes';
import {
  Languages,
  Bot,
  Podcast,
  CheckCircle,
  AlertCircle,
  Download,
  Play,
  Loader2,
  Plus,
  Rss,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Mic,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fa', name: 'Persian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'tr', name: 'Turkish' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ru', name: 'Russian' },
] as const;

// ── Helpers ──────────────────────────────────────────────

function detectNativeLanguage(): string {
  const browserLang = navigator.language?.split('-')[0]?.toLowerCase() ?? 'en';
  const supported = LANGUAGES.find((l) => l.code === browserLang);
  return supported ? supported.code : 'en';
}

function defaultTargetLanguage(nativeLang: string): string {
  return nativeLang === 'en' ? 'es' : 'en';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const WIZARD_MODELS = RECOMMENDED_OLLAMA_MODELS.filter((m) =>
  ['llama3.2', 'gemma3:4b', 'phi4-mini', 'llama3.1:8b'].includes(m.name),
);

function formatSizeMb(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
}

// ── Step indicators ──────────────────────────────────────

const STEPS = [
  { label: 'Languages', icon: Languages },
  { label: 'AI Setup', icon: Bot },
  { label: 'Whisper', icon: Mic },
  { label: 'Podcast', icon: Podcast },
] as const;

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === currentStep;
        const isCompleted = i < currentStep;
        return (
          <div key={step.label} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-8 ${isCompleted ? 'bg-primary' : 'bg-border'}`}
              />
            )}
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : isCompleted
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Languages ────────────────────────────────────

function LanguageStep({
  nativeLang,
  targetLang,
  onNativeChange,
  onTargetChange,
}: {
  nativeLang: string;
  targetLang: string;
  onNativeChange: (v: string) => void;
  onTargetChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <Languages className="h-7 w-7 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Welcome to FlexiDesk</h1>
      <p className="text-muted-foreground mb-8 text-center max-w-md">
        Let's set up your learning environment
      </p>

      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Your native language</label>
          <Select value={nativeLang} onValueChange={onNativeChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Language you're learning</label>
          <Select value={targetLang} onValueChange={onTargetChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.filter((l) => l.code !== nativeLang).map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: AI Setup ─────────────────────────────────────

type OllamaState = 'checking' | 'not-installed' | 'installed-not-running' | 'ready' | 'error';

function AISetupStep({
  ollamaState,
  installStatus,
  isInstalling,
  installProgress,
  isStarting,
  isConnected,
  models,
  isPulling,
  pullProgress,
  error,
  skipped,
  onInstall,
  onStartServe,
  onPullModel,
  onSkip,
  selectedModel,
  onSelectModel,
}: {
  ollamaState: OllamaState;
  installStatus: OllamaInstallStatus | null;
  isInstalling: boolean;
  installProgress: OllamaInstallProgress | null;
  isStarting: boolean;
  isConnected: boolean;
  models: string[];
  isPulling: boolean;
  pullProgress: OllamaPullProgress | null;
  error: string | null;
  skipped: boolean;
  onInstall: () => void;
  onStartServe: () => void;
  onPullModel: () => void;
  onSkip: () => void;
  selectedModel: string;
  onSelectModel: (name: string) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <Bot className="h-7 w-7 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">AI Assistant</h1>
      <p className="text-muted-foreground mb-8 text-center max-w-md">
        FlexiDesk uses AI to help you learn. All AI runs locally on your machine.
      </p>

      <div className="w-full max-w-md space-y-4">
        {/* Checking state */}
        {ollamaState === 'checking' && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking Ollama status...</span>
          </div>
        )}

        {/* Not installed */}
        {ollamaState === 'not-installed' && !isInstalling && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Ollama not found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ollama powers the local AI features. Install it to use the tutor, writing assistant, and more.
                </p>
              </div>
            </div>
            <Button onClick={onInstall} className="w-full gap-2">
              <Download className="h-4 w-4" />
              Install Ollama
            </Button>
          </div>
        )}

        {/* Installing */}
        {isInstalling && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-foreground">Installing Ollama...</span>
            </div>
            {installProgress && (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(installProgress.percent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {installProgress.percent.toFixed(0)}%
                  {installProgress.totalBytes > 0 &&
                    ` - ${formatBytes(installProgress.downloadedBytes)} / ${formatBytes(installProgress.totalBytes)}`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Installed but not running */}
        {ollamaState === 'installed-not-running' && !isStarting && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Ollama is installed but not running</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Start the Ollama server to enable AI features.
                </p>
              </div>
            </div>
            <Button onClick={onStartServe} className="w-full gap-2">
              <Play className="h-4 w-4" />
              Start Ollama
            </Button>
          </div>
        )}

        {/* Starting serve */}
        {isStarting && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-foreground">Starting Ollama server...</span>
          </div>
        )}

        {/* Ready state */}
        {ollamaState === 'ready' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
              <CheckCircle className="h-5 w-5 text-success shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Ollama is ready!</p>
                {models.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Installed models: {models.join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* No models — offer to choose and download */}
            {models.length === 0 && !isPulling && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Choose an AI model</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Smaller models are faster. Larger ones are more capable.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {WIZARD_MODELS.map((model) => (
                    <label
                      key={model.name}
                      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        selectedModel === model.name
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="ai-model"
                        value={model.name}
                        checked={selectedModel === model.name}
                        onChange={() => onSelectModel(model.name)}
                        className="sr-only"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{model.displayName}</span>
                          <span className="text-xs text-muted-foreground">{model.parameterCount}</span>
                          <span className="text-xs text-muted-foreground">~{formatSizeMb(model.sizeMb)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
                      </div>
                      {selectedModel === model.name && (
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </label>
                  ))}
                </div>
                <Button onClick={onPullModel} className="w-full gap-2">
                  <Download className="h-4 w-4" />
                  Download {WIZARD_MODELS.find((m) => m.name === selectedModel)?.displayName ?? 'model'}
                </Button>
              </div>
            )}

            {/* Pulling model */}
            {isPulling && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-foreground">
                    Downloading {pullProgress?.modelName ?? selectedModel}...
                  </span>
                </div>
                {pullProgress && (
                  <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.min(pullProgress.percent, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                      {pullProgress.percent.toFixed(0)}%
                      {pullProgress.total && pullProgress.completed != null &&
                        ` - ${formatBytes(pullProgress.completed)} / ${formatBytes(pullProgress.total)}`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && ollamaState === 'error' && (
          <div className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4">
            <AlertCircle className="h-5 w-5 text-error mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Something went wrong</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Skip link */}
        {!skipped && ollamaState !== 'ready' && (
          <button
            onClick={onSkip}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          >
            Skip for now
          </button>
        )}
        {skipped && (
          <p className="text-center text-xs text-muted-foreground">
            You can set up AI later in Settings.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Step 3: First Podcast ────────────────────────────────

function PodcastStep({
  subscribedUrls,
  subscribingUrl,
  onSubscribe,
  onAddCustomFeed,
}: {
  subscribedUrls: Set<string>;
  subscribingUrl: string | null;
  onSubscribe: (url: string) => void;
  onAddCustomFeed: (url: string) => void;
}) {
  const [customUrl, setCustomUrl] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const { starterPodcasts, isStarterLoading, fetchStarterPodcasts } = useDiscoverStore();

  useEffect(() => {
    if (starterPodcasts.length === 0 && !isStarterLoading) {
      fetchStarterPodcasts();
    }
  }, [starterPodcasts.length, isStarterLoading, fetchStarterPodcasts]);

  const handleAddCustom = () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      setCustomError('Please enter a valid URL');
      return;
    }
    setCustomError(null);
    onAddCustomFeed(trimmed);
    setCustomUrl('');
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <Podcast className="h-7 w-7 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Add Your First Podcast</h1>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        Learn by listening to real content
      </p>

      <div className="w-full max-w-lg space-y-3">
        <div className="max-h-[360px] overflow-y-auto space-y-3 pr-1">
          {isStarterLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading podcasts…</span>
            </div>
          ) : (
            starterPodcasts.map((podcast) => {
              const url = podcast.rssUrl ?? '';
              const isSubscribed = subscribedUrls.has(url);
              const isSubscribing = subscribingUrl === url;
              return (
                <div
                  key={url}
                  className={`flex items-center gap-4 rounded-lg border p-3 transition-colors ${
                    isSubscribed
                      ? 'border-success/30 bg-success/5'
                      : 'border-border bg-card hover:border-primary/30'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Rss className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {podcast.title}
                      {podcast.author && (
                        <span className="text-muted-foreground font-normal"> by {podcast.author}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {podcast.description}
                    </p>
                  </div>
                  {isSubscribed ? (
                    <CheckCircle className="h-5 w-5 text-success shrink-0" />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSubscribing || !url}
                      onClick={() => onSubscribe(url)}
                      className="shrink-0 gap-1.5"
                    >
                      {isSubscribing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {isSubscribing ? 'Adding...' : 'Subscribe'}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Custom RSS URL */}
        <div className="pt-3 border-t border-border space-y-2">
          <label className="text-sm font-medium text-foreground">Add by RSS URL</label>
          <div className="flex gap-2">
            <Input
              value={customUrl}
              onChange={(e) => {
                setCustomUrl(e.target.value);
                setCustomError(null);
              }}
              placeholder="https://example.com/feed.rss"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCustom();
              }}
            />
            <Button
              variant="outline"
              onClick={handleAddCustom}
              disabled={!customUrl.trim() || subscribingUrl !== null}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          {customError && <p className="text-xs text-error">{customError}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Whisper Setup ────────────────────────────────

const WIZARD_WHISPER_MODELS = ['tiny', 'base', 'small', 'large-v3-turbo-q5_0', 'large-v3-turbo'];

function WhisperStep({ skipped, onSkip }: { skipped: boolean; onSkip: () => void }) {
  const {
    whisperInfo,
    whisperInstallStatus,
    isInstallingWhisper,
    whisperInstallMessage,
    isInstallingHomebrew,
    availableModels,
    isLoadingModels,
    isDownloading,
    downloadProgress,
    checkWhisper,
    checkWhisperInstallStatus,
    autoDetectWhisper,
    installWhisper,
    installHomebrew,
    fetchAvailableModels,
    downloadModel,
    setActiveModel,
    setDownloadProgress,
    setWhisperInstallMessage,
  } = useCaptionStore();

  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check whisper status on mount
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await checkWhisperInstallStatus();
        const detected = await autoDetectWhisper();
        if (!cancelled && detected) {
          await fetchAvailableModels();
          await checkWhisper();
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Listen for download progress
  useEffect(() => {
    if (!isDownloading) return;
    let unlisten: UnlistenFn | undefined;
    listen<RawWhisperDownloadProgress>('whisper-download-progress', (event) => {
      setDownloadProgress(mapWhisperDownloadProgress(event.payload));
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [isDownloading]);

  // Listen for install progress
  useEffect(() => {
    if (!isInstallingWhisper && !isInstallingHomebrew) return;
    let unlisten: UnlistenFn | undefined;
    listen<{ status: string; message: string; percent: number }>('whisper-install-progress', (event) => {
      setWhisperInstallMessage(event.payload.message);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [isInstallingWhisper, isInstallingHomebrew]);

  const handleInstallWhisper = useCallback(async () => {
    setError(null);
    try {
      await installWhisper();
      await fetchAvailableModels();
      await checkWhisper();
    } catch (err) {
      setError(String(err));
    }
  }, [installWhisper, fetchAvailableModels, checkWhisper]);

  const handleDownloadModel = useCallback(async (modelId: string) => {
    setError(null);
    try {
      const path = await downloadModel(modelId);
      if (path) {
        await setActiveModel(modelId);
        await checkWhisper();
      }
    } catch (err) {
      setError(String(err));
    }
  }, [downloadModel, setActiveModel, checkWhisper]);

  const binaryDetected = whisperInstallStatus?.binaryDetected ?? false;
  const isReady = whisperInfo?.isAvailable ?? false;
  const wizardModels = availableModels.filter((m) => WIZARD_WHISPER_MODELS.includes(m.id));

  return (
    <div className="flex flex-col items-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <Mic className="h-7 w-7 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Speech Recognition</h1>
      <p className="text-muted-foreground mb-8 text-center max-w-md">
        Whisper transcribes audio locally. Used by Live Caption and Podcast features.
      </p>

      <div className="w-full max-w-md space-y-4">
        {/* Checking */}
        {checking && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Detecting Whisper...</span>
          </div>
        )}

        {/* Binary not found */}
        {!checking && !binaryDetected && !isInstallingWhisper && !isInstallingHomebrew && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Whisper not found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click below to install whisper-cli automatically.
                </p>
              </div>
            </div>
            <Button onClick={handleInstallWhisper} className="w-full gap-2">
              <Download className="h-4 w-4" />
              Install Whisper
            </Button>
          </div>
        )}

        {/* Installing */}
        {(isInstallingWhisper || isInstallingHomebrew) && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-foreground">
                {isInstallingHomebrew ? 'Setting up dependencies...' : 'Installing Whisper...'}
              </span>
            </div>
            {whisperInstallMessage && (
              <p className="text-xs text-muted-foreground truncate">{whisperInstallMessage}</p>
            )}
          </div>
        )}

        {/* Binary found, show models */}
        {!checking && binaryDetected && !isReady && !isDownloading && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Choose a Whisper model</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Larger models are more accurate but slower and need more RAM.
                </p>
              </div>
            </div>
            {isLoadingModels ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Loading models...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {wizardModels.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.sizeMb} MB</span>
                        <span className="text-xs text-muted-foreground">{model.speed}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
                    </div>
                    {model.isDownloaded ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadModel(model.id)}
                        className="shrink-0 gap-1.5"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Use
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadModel(model.id)}
                        className="shrink-0 gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Downloading model */}
        {isDownloading && downloadProgress && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-foreground">Downloading model...</span>
            </div>
            <div className="space-y-1">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {downloadProgress.percent.toFixed(0)}%
                {downloadProgress.totalBytes > 0 &&
                  ` — ${formatBytes(downloadProgress.downloadedBytes)} / ${formatBytes(downloadProgress.totalBytes)}`}
              </p>
            </div>
          </div>
        )}

        {/* Ready */}
        {isReady && (
          <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
            <CheckCircle className="h-5 w-5 text-success shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Whisper is ready!</p>
              {whisperInfo?.modelName && (
                <p className="text-xs text-muted-foreground mt-1">
                  Active model: {whisperInfo.modelName}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4">
            <AlertCircle className="h-5 w-5 text-error mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        )}

        {/* Skip */}
        {!skipped && !isReady && (
          <button
            onClick={onSkip}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          >
            Skip for now
          </button>
        )}
        {skipped && (
          <p className="text-center text-xs text-muted-foreground">
            You can set up Whisper later in Settings.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main SetupWizard ─────────────────────────────────────

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0);

  // Step 1 state
  const detectedNative = detectNativeLanguage();
  const [nativeLang, setNativeLang] = useState(detectedNative);
  const [targetLang, setTargetLang] = useState(defaultTargetLanguage(detectedNative));

  // Step 2 state
  const [ollamaState, setOllamaState] = useState<OllamaState>('checking');
  const [installStatus, setInstallStatus] = useState<OllamaInstallStatus | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<OllamaInstallProgress | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSkipped, setAiSkipped] = useState(false);
  const [modelPulled, setModelPulled] = useState(false);
  const [selectedModelName, setSelectedModelName] = useState('llama3.2');

  // Step 3 state (Whisper)
  const [whisperSkipped, setWhisperSkipped] = useState(false);

  // Step 4 state
  const [subscribedUrls, setSubscribedUrls] = useState<Set<string>>(new Set());
  const [subscribingUrl, setSubscribingUrl] = useState<string | null>(null);

  // Fix target language if native changes to match it
  const handleNativeChange = useCallback(
    (code: string) => {
      setNativeLang(code);
      if (targetLang === code) {
        setTargetLang(defaultTargetLanguage(code));
      }
    },
    [targetLang],
  );

  // ── Ollama check on step 2 mount ──────────────────────
  useEffect(() => {
    if (step !== 1) return;

    let cancelled = false;

    async function checkOllama() {
      setOllamaState('checking');
      setAiError(null);
      try {
        const rawInstall = await invoke<RawOllamaInstallStatus>('ollama_install_status');
        const status = mapOllamaInstallStatus(rawInstall);
        if (cancelled) return;
        setInstallStatus(status);

        if (!status.isInstalled) {
          setOllamaState('not-installed');
          return;
        }

        if (!status.isServeRunning) {
          setOllamaState('installed-not-running');
          return;
        }

        // Installed and running — check connection + models
        const rawStatus = await invoke<RawOllamaStatus>('ollama_status');
        const mapped = mapOllamaStatus(rawStatus);
        if (cancelled) return;

        setIsConnected(mapped.connected);
        setModels(mapped.models.map((m) => m.name));
        setOllamaState(mapped.connected ? 'ready' : 'installed-not-running');
      } catch (err) {
        if (cancelled) return;
        setAiError(String(err));
        setOllamaState('error');
      }
    }

    checkOllama();
    return () => {
      cancelled = true;
    };
  }, [step]);

  // ── Ollama install progress listener ───────────────────
  useEffect(() => {
    if (!isInstalling) return;
    let unlisten: UnlistenFn | undefined;

    listen<RawOllamaInstallProgress>('ollama-install-progress', (event) => {
      setInstallProgress(mapOllamaInstallProgress(event.payload));
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [isInstalling]);

  // ── Ollama pull progress listener ──────────────────────
  useEffect(() => {
    if (!isPulling) return;
    let unlisten: UnlistenFn | undefined;

    listen<RawOllamaPullProgress>('ollama-pull-progress', (event) => {
      setPullProgress(mapOllamaPullProgress(event.payload));
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [isPulling]);

  // ── Ollama actions ─────────────────────────────────────
  const handleInstallOllama = useCallback(async () => {
    setIsInstalling(true);
    setInstallProgress(null);
    setAiError(null);
    try {
      await invoke('ollama_install');
      setIsInstalling(false);
      setInstallProgress(null);
      // After install, start serve
      setIsStarting(true);
      await invoke('ollama_start_serve');
      setIsStarting(false);
      // Re-check status
      const rawStatus = await invoke<RawOllamaStatus>('ollama_status');
      const mapped = mapOllamaStatus(rawStatus);
      setIsConnected(mapped.connected);
      setModels(mapped.models.map((m) => m.name));
      setOllamaState(mapped.connected ? 'ready' : 'installed-not-running');
    } catch (err) {
      setIsInstalling(false);
      setIsStarting(false);
      setAiError(String(err));
      setOllamaState('error');
    }
  }, []);

  const handleStartServe = useCallback(async () => {
    setIsStarting(true);
    setAiError(null);
    try {
      await invoke('ollama_start_serve');
      // Re-check connection
      const rawStatus = await invoke<RawOllamaStatus>('ollama_status');
      const mapped = mapOllamaStatus(rawStatus);
      setIsConnected(mapped.connected);
      setModels(mapped.models.map((m) => m.name));
      setOllamaState(mapped.connected ? 'ready' : 'installed-not-running');
      setIsStarting(false);
    } catch (err) {
      setIsStarting(false);
      setAiError(String(err));
      setOllamaState('error');
    }
  }, []);

  const handlePullModel = useCallback(async () => {
    setIsPulling(true);
    setPullProgress(null);
    setAiError(null);
    try {
      await invoke('ollama_pull_model', { modelName: selectedModelName });
      setIsPulling(false);
      setPullProgress(null);
      setModelPulled(true);
      // Refresh models
      const rawStatus = await invoke<RawOllamaStatus>('ollama_status');
      const mapped = mapOllamaStatus(rawStatus);
      setModels(mapped.models.map((m) => m.name));
    } catch (err) {
      setIsPulling(false);
      setPullProgress(null);
      setAiError(String(err));
    }
  }, [selectedModelName]);

  // ── Podcast actions ────────────────────────────────────
  const handleSubscribe = useCallback(async (url: string) => {
    setSubscribingUrl(url);
    try {
      await invoke('podcast_add_feed', { feedUrl: url });
      setSubscribedUrls((prev) => new Set(prev).add(url));
    } catch (err) {
      console.error('Failed to subscribe:', err);
    } finally {
      setSubscribingUrl(null);
    }
  }, []);

  // ── Finish onboarding ─────────────────────────────────
  const handleComplete = useCallback(async () => {
    await setSetting('native_language', nativeLang);
    await setSetting('target_language', targetLang);

    if (modelPulled) {
      await setSetting('ai_model', selectedModelName);
      await setSetting('ai_provider', 'ollama');
    }

    await setSetting('onboarding_complete', 'true');
    onComplete();
  }, [nativeLang, targetLang, modelPulled, selectedModelName, onComplete]);

  // ── Can proceed to next step ──────────────────────────
  const whisperReady = useCaptionStore((s) => s.whisperInfo?.isAvailable ?? false);

  const canGoNext = (): boolean => {
    if (step === 0) return true;
    if (step === 1) return ollamaState === 'ready' || aiSkipped;
    if (step === 2) return whisperReady || whisperSkipped;
    return true;
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background text-foreground">
      <div className="w-full max-w-2xl mx-auto px-6 py-8 min-h-full flex flex-col justify-center">
        <StepIndicator currentStep={step} />

        <div className="flex flex-col justify-center">
          {step === 0 && (
            <LanguageStep
              nativeLang={nativeLang}
              targetLang={targetLang}
              onNativeChange={handleNativeChange}
              onTargetChange={setTargetLang}
            />
          )}

          {step === 1 && (
            <AISetupStep
              ollamaState={ollamaState}
              installStatus={installStatus}
              isInstalling={isInstalling}
              installProgress={installProgress}
              isStarting={isStarting}
              isConnected={isConnected}
              models={models}
              isPulling={isPulling}
              pullProgress={pullProgress}
              error={aiError}
              skipped={aiSkipped}
              onInstall={handleInstallOllama}
              onStartServe={handleStartServe}
              onPullModel={handlePullModel}
              onSkip={() => setAiSkipped(true)}
              selectedModel={selectedModelName}
              onSelectModel={setSelectedModelName}
            />
          )}

          {step === 2 && (
            <WhisperStep
              skipped={whisperSkipped}
              onSkip={() => setWhisperSkipped(true)}
            />
          )}

          {step === 3 && (
            <PodcastStep
              subscribedUrls={subscribedUrls}
              subscribingUrl={subscribingUrl}
              onSubscribe={handleSubscribe}
              onAddCustomFeed={handleSubscribe}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
          <div>
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)} className="gap-1.5">
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === 3 && (
              <Button variant="ghost" onClick={handleComplete}>
                Skip
              </Button>
            )}

            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canGoNext()}
                className="gap-1.5"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleComplete} className="gap-1.5">
                <Sparkles className="h-4 w-4" />
                Get Started!
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
