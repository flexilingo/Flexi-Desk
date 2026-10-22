import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  HardDrive,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
  Monitor,
  Wifi,
  WifiOff,
  Search,
  Play,
  Square,
  Zap,
  Target,
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useOllamaStore } from '@/stores/ollamaStore';
import {
  RECOMMENDED_OLLAMA_MODELS,
  modelKey,
  mapOllamaPullProgress,
  mapOllamaInstallProgress,
  type RawOllamaPullProgress,
  type RawOllamaInstallProgress,
  type OllamaModel,
  type RecommendedOllamaModel,
} from '@/stores/ollamaTypes';

export function OllamaModelManager() {
  const { t } = useTranslation('ai');
  const {
    isConnected,
    version,
    isCheckingConnection,
    installedModels,
    isLoadingModels,
    isPulling,
    pullProgress,
    pullingModelName,
    selectedModel,
    installStatus,
    isInstalling,
    installProgress,
    isStartingServe,
    error,
    checkConnection,
    pullModel,
    deleteModel,
    selectModel,
    setPullProgress,
    clearError,
    loadSelectedModel,
    checkInstallStatus,
    installOllama,
    startServe,
    stopServe,
    setInstallProgress,
  } = useOllamaStore();

  const [customModelName, setCustomModelName] = useState('');
  const [modelSearch, setModelSearch] = useState('');

  useEffect(() => {
    checkInstallStatus();
    checkConnection();
    loadSelectedModel();
  }, [checkInstallStatus, checkConnection, loadSelectedModel]);

  // Listen for pull progress events
  useEffect(() => {
    const unlisten = listen<RawOllamaPullProgress>('ollama-pull-progress', (event) => {
      setPullProgress(mapOllamaPullProgress(event.payload));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setPullProgress]);

  // Listen for install progress events
  useEffect(() => {
    const unlisten = listen<RawOllamaInstallProgress>('ollama-install-progress', (event) => {
      setInstallProgress(mapOllamaInstallProgress(event.payload));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setInstallProgress]);

  const handleCustomPull = () => {
    const name = customModelName.trim();
    if (!name || isPulling) return;
    pullModel(name);
    setCustomModelName('');
  };

  // Figure out which recommended models are not installed
  const installedNames = new Set(installedModels.map((m) => m.name.replace(/:latest$/, '')));
  const notInstalledRecommended = RECOMMENDED_OLLAMA_MODELS.filter(
    (r) => !installedNames.has(r.name) && !installedNames.has(r.name + ':latest'),
  );

  // Filter logic
  const filterFn = (text: string) => {
    if (!modelSearch.trim()) return true;
    const q = modelSearch.toLowerCase();
    return text.toLowerCase().includes(q);
  };

  const filteredInstalled = installedModels.filter((m) => filterFn(m.name));
  const filteredRecommended = notInstalledRecommended.filter(
    (m) => filterFn(m.name) || filterFn(m.displayName) || filterFn(m.description),
  );

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="flex items-center justify-between rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          <span className="truncate">{error}</span>
          <button onClick={clearError} className="ms-2 shrink-0 text-xs underline">
            {t('engine.dismiss')}
          </button>
        </div>
      )}

      {/* ── Not Connected States ── */}
      {!isConnected && (
        <>
          {/* State A: Not installed at all */}
          {installStatus && !installStatus.isInstalled && !isInstalling && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <WifiOff className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t('engine.notInstalledTitle')}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('engine.notInstalledDesc')}</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {installStatus.platform === 'macos' ? 'macOS' : 'Linux'}{' '}
                  {installStatus.arch === 'aarch64' ? 'ARM64' : 'x64'}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{t('engine.download')}</span>
              </div>
              <Button onClick={installOllama}>
                <Download className="h-4 w-4" />
                {t('engine.install')}
              </Button>
            </div>
          )}

          {/* Installing progress */}
          {isInstalling && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">{t('engine.installing')}</span>
              </div>
              {installProgress && (
                <ProgressBar
                  percent={installProgress.percent}
                  status={
                    installProgress.status === 'downloading'
                      ? t('engine.downloadingBytes', {
                          done: formatSize(installProgress.downloadedBytes),
                          total: formatSize(installProgress.totalBytes),
                        })
                      : installProgress.status
                  }
                />
              )}
            </div>
          )}

          {/* State B: Installed but serve not running */}
          {installStatus &&
            installStatus.isInstalled &&
            !installStatus.isServeRunning &&
            !isInstalling &&
            !isStartingServe && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t('engine.notRunningTitle')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {installStatus.isSystemInstall
                    ? t('engine.foundAtSystem', { path: installStatus.binaryPath })
                    : t('engine.foundAt', { path: installStatus.binaryPath })}
                </p>
                <Button onClick={startServe}>
                  <Play className="h-4 w-4" />
                  {t('engine.start')}
                </Button>
              </div>
            )}

          {/* Starting serve spinner */}
          {isStartingServe && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">{t('engine.starting')}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('engine.waiting')}</p>
            </div>
          )}

          {/* Checking connection */}
          {isCheckingConnection && !installStatus && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('engine.checking')}</span>
            </div>
          )}
        </>
      )}

      {/* ── Connected State ── */}
      {isConnected && (
        <>
          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-sm text-success">
                <Wifi className="h-4 w-4" />
                {version ? t('engine.connectedVersion', { version }) : t('engine.connected')}
              </div>
              {installStatus?.isSystemInstall && (
                <Badge variant="outline" className="text-[10px]">
                  {t('engine.system')}
                </Badge>
              )}
              {installStatus?.isManaged && (
                <Badge variant="outline" className="text-[10px]">
                  {t('engine.managed')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {installStatus?.isManaged && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={stopServe}
                  title={t('engine.stop')}
                  aria-label={t('engine.stop')}
                >
                  <Square className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  checkConnection();
                  checkInstallStatus();
                }}
                disabled={isCheckingConnection}
                aria-label={t('engine.refresh')}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isCheckingConnection ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder={t('engine.search')}
              className="ps-8 h-8 text-sm"
            />
          </div>

          {/* Installed Models */}
          {isLoadingModels ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {filteredInstalled.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t('engine.installedModels')}
                  </label>
                  <div className="space-y-1.5">
                    {filteredInstalled.map((model) => (
                      <InstalledModelRow
                        key={model.name}
                        model={model}
                        isActive={selectedModel === model.name}
                        onSelect={() => selectModel(model.name)}
                        onDelete={() => deleteModel(model.name)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {installedModels.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  {t('engine.noModels')}
                </p>
              )}
            </>
          )}

          {/* Recommended Models */}
          {filteredRecommended.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('engine.recommended')}
              </label>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {filteredRecommended.map((model) => (
                  <RecommendedModelRow
                    key={model.name}
                    model={model}
                    isPulling={isPulling && pullingModelName === model.name}
                    pullProgress={pullingModelName === model.name ? pullProgress : null}
                    onPull={() => pullModel(model.name)}
                    disabled={isPulling}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Custom Model Pull */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('engine.custom')}
            </label>
            <div className="flex gap-2">
              <Input
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                placeholder={t('engine.customPlaceholder')}
                className="flex-1 h-8 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleCustomPull()}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleCustomPull}
                disabled={!customModelName.trim() || isPulling}
              >
                {isPulling && pullingModelName === customModelName.trim() ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Download className="h-3 w-3" />
                    {t('engine.pull')}
                  </>
                )}
              </Button>
            </div>
            {isPulling &&
              pullingModelName &&
              !RECOMMENDED_OLLAMA_MODELS.some((r) => r.name === pullingModelName) &&
              pullProgress && (
                <ProgressBar percent={pullProgress.percent} status={pullProgress.status} />
              )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Installed Model Row ───────────────────────────────────

function InstalledModelRow({
  model,
  isActive,
  onSelect,
  onDelete,
}: {
  model: OllamaModel;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('ai');
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
        isActive ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/50'
      }`}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <HardDrive className={`h-3.5 w-3.5 ${isActive ? 'text-primary' : 'text-success'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{model.name}</span>
          <span className="text-xs text-muted-foreground">{formatSize(model.size)}</span>
          {isActive && (
            <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {t('engine.active')}
            </Badge>
          )}
        </div>
        {(() => {
          const rec = RECOMMENDED_OLLAMA_MODELS.find((r) => r.name === model.name);
          return rec ? (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Zap className="h-3 w-3" />
                {t(`engine.speed.${rec.speed.replace(/\s/g, '')}`)}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Target className="h-3 w-3" />
                {t(`engine.accuracy.${rec.accuracy.replace(/\s/g, '')}`)}
              </span>
            </div>
          ) : null;
        })()}
      </div>
      <div className="flex items-center gap-1">
        {!isActive && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSelect}>
            <Monitor className="h-3 w-3" />
            {t('engine.use')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1.5"
          onClick={onDelete}
          disabled={isActive}
          aria-label={t('engine.delete')}
        >
          <Trash2 className="h-3.5 w-3.5 text-error" />
        </Button>
      </div>
    </div>
  );
}

// ── Recommended Model Row ─────────────────────────────────

function RecommendedModelRow({
  model,
  isPulling,
  pullProgress,
  onPull,
  disabled,
}: {
  model: RecommendedOllamaModel;
  isPulling: boolean;
  pullProgress: { percent: number; status: string } | null;
  onPull: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('ai');
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{model.displayName}</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {model.parameterCount}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatSizeMb(model.sizeMb)}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {t(`engine.models.${modelKey(model.name)}`, { defaultValue: model.description })}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Zap className="h-3 w-3" />
            {t(`engine.speed.${model.speed.replace(/\s/g, '')}`)}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Target className="h-3 w-3" />
            {t(`engine.accuracy.${model.accuracy.replace(/\s/g, '')}`)}
          </span>
        </div>
        {isPulling && pullProgress && (
          <ProgressBar percent={pullProgress.percent} status={pullProgress.status} />
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs shrink-0"
        onClick={onPull}
        disabled={disabled}
      >
        {isPulling ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <Download className="h-3 w-3" />
            {t('engine.pull')}
          </>
        )}
      </Button>
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────

function ProgressBar({ percent, status }: { percent: number; status: string }) {
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        <progress
          max={100}
          value={Math.min(percent, 100)}
          className="block h-1.5 flex-1 appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {Math.round(percent)}%
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{status}</p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

function formatSizeMb(mb: number): string {
  if (mb >= 1000) return `~${(mb / 1000).toFixed(1)} GB`;
  return `~${mb} MB`;
}
