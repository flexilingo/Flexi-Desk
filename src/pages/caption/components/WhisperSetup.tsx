import { useEffect, useState } from 'react';
import {
  Settings,
  FolderOpen,
  CheckCircle2,
  Loader2,
  Download,
  Trash2,
  HardDrive,
  Globe,
  Monitor,
  Zap,
  Target,
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronUp,
  Languages,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { open } from '@/lib/nativeDialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCaptionStore } from '../stores/captionStore';
import type { RawDownloadProgress } from '../types';
import { mapDownloadProgress, speedLabel } from '../types';

type SetupTab = 'download' | 'manual';

interface WhisperSetupProps {
  onClose?: () => void;
}

export function WhisperSetup({ onClose }: WhisperSetupProps) {
  const { t } = useTranslation('caption');
  const {
    whisperInfo,
    isConfiguringWhisper,
    configureWhisper,
    availableModels,
    isLoadingModels,
    isDownloading,
    downloadProgress,
    fetchAvailableModels,
    downloadModel,
    deleteModel,
    setDownloadProgress,
    setView,
    whisperInstallStatus,
    isInstallingWhisper,
    isInstallingHomebrew,
    checkWhisperInstallStatus,
    autoDetectWhisper,
    installWhisper,
    installHomebrew,
    error: storeError,
    clearError,
  } = useCaptionStore();

  const [tab, setTab] = useState<SetupTab>('download');
  const [binaryPath, setBinaryPath] = useState(whisperInfo?.binaryPath ?? '');
  const [modelPath, setModelPath] = useState(whisperInfo?.modelPath ?? '');
  const [modelName, setModelName] = useState(whisperInfo?.modelName ?? 'base');
  const [modelSearch, setModelSearch] = useState('');
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [showManualSetup, setShowManualSetup] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  // Fetch models and check install status on mount
  useEffect(() => {
    fetchAvailableModels();
    checkWhisperInstallStatus();
  }, [fetchAvailableModels, checkWhisperInstallStatus]);

  // Auto-detect whisper binary on mount (if not already configured)
  useEffect(() => {
    if (!whisperInfo?.isAvailable && whisperInstallStatus && !whisperInstallStatus.binaryDetected) {
      // No binary found via install status, that's fine
    } else if (
      !whisperInfo?.isAvailable &&
      whisperInstallStatus?.binaryDetected &&
      whisperInstallStatus.binaryPath
    ) {
      // Binary detected at a common path, auto-set it
      setBinaryPath(whisperInstallStatus.binaryPath);
      setIsAutoDetecting(true);
      autoDetectWhisper().then((found) => {
        setIsAutoDetecting(false);
        if (found && whisperInstallStatus.binaryPath) {
          setBinaryPath(whisperInstallStatus.binaryPath);
        }
      });
    }
  }, [whisperInfo?.isAvailable, whisperInstallStatus, autoDetectWhisper]);

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen<RawDownloadProgress>('whisper-download-progress', (event) => {
      setDownloadProgress(mapDownloadProgress(event.payload));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setDownloadProgress]);

  // Listen for whisper install progress events
  useEffect(() => {
    const unlisten = listen<{ status: string; message: string; percent: number }>(
      'whisper-install-progress',
      (event) => {
        useCaptionStore.getState().setWhisperInstallMessage(event.payload.message);
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleBrowseBinary = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: t('setup.pickBinary'),
      });
      if (selected) setBinaryPath(selected as string);
    } catch {
      // User cancelled
    }
  };

  const handleBrowseModel = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: t('setup.pickModel'),
        filters: [{ name: t('setup.modelFilter'), extensions: ['bin'] }],
      });
      if (selected) setModelPath(selected as string);
    } catch {
      // User cancelled
    }
  };

  const handleSave = () => {
    if (!binaryPath.trim() || !modelPath.trim()) return;
    configureWhisper(binaryPath.trim(), modelPath.trim(), modelName.trim() || undefined);
  };

  const handleDownloadAndConfigure = async (modelId: string) => {
    const path = await downloadModel(modelId);
    if (path) {
      setModelPath(path);
      setModelName(modelId);
      // If binary is already set, auto-configure
      if (binaryPath.trim()) {
        configureWhisper(binaryPath.trim(), path, modelId);
      }
    }
  };

  const handleSelectDownloadedModel = (localPath: string, id: string) => {
    setModelPath(localPath);
    setModelName(id);
    if (binaryPath.trim()) {
      configureWhisper(binaryPath.trim(), localPath, id);
    }
  };

  const isValid = binaryPath.trim().length > 0 && modelPath.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          {(whisperInfo?.isAvailable || onClose) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose ?? (() => setView('sessions'))}
              aria-label={t('common.back')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>{t('setup.title')}</CardTitle>
            <CardDescription>{t('setup.subtitle')}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Success state */}
        {whisperInfo?.isAvailable && (
          <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            {t('setup.ready')}
          </div>
        )}

        {/* Info Section */}
        <div className="rounded-lg border border-primary/20 bg-primary/5">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={infoExpanded}
            onClick={() => setInfoExpanded(!infoExpanded)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setInfoExpanded(!infoExpanded);
            }}
            className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-start"
          >
            <Languages className="h-4 w-4 text-primary shrink-0" />
            <span className="flex-1 text-sm font-medium text-foreground">
              {t('setup.infoTitle')}
            </span>
            {infoExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          {infoExpanded && (
            <div className="border-t border-primary/10 px-3 py-3 space-y-3 text-xs text-muted-foreground">
              <p>{t('setup.infoIntro')}</p>
              <div className="space-y-1.5">
                <p className="font-medium text-foreground">{t('setup.howToChoose')}</p>
                <ul className="space-y-1 ms-3 list-disc">
                  <li>
                    <strong className="text-foreground">{t('setup.tinyBase')}</strong> -{' '}
                    {t('setup.tinyBaseBody')}
                  </li>
                  <li>
                    <strong className="text-foreground">{t('setup.smallMedium')}</strong> -{' '}
                    {t('setup.smallMediumBody')}
                  </li>
                  <li>
                    <strong className="text-foreground">{t('setup.turbo')}</strong> -{' '}
                    <span className="text-success font-medium">{t('setup.recommended')}</span>{' '}
                    {t('setup.turboBody')}
                  </li>
                  <li>
                    <strong className="text-foreground">{t('setup.large')}</strong> -{' '}
                    {t('setup.largeBody')}
                  </li>
                </ul>
              </div>
              <div className="space-y-1.5">
                <p className="font-medium text-foreground">{t('setup.quantTitle')}</p>
                <p>{t('setup.quantBody')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Step 1: Binary Path — Auto-detect + Install */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">
              {t('setup.step1')}
            </Badge>
            <label className="text-sm font-medium text-foreground">{t('setup.binary')}</label>
          </div>

          {/* Auto-detecting */}
          {isAutoDetecting && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('setup.detecting')}
            </div>
          )}

          {/* Binary already configured */}
          {binaryPath && !isAutoDetecting && (
            <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              <span className="truncate font-mono text-xs">{binaryPath}</span>
            </div>
          )}

          {/* Not found — Install options */}
          {!binaryPath && !isAutoDetecting && whisperInstallStatus && (
            <div className="space-y-2">
              {/* AVX2 incompatibility — guidance card */}
              {storeError && storeError.includes('AVX2') && (
                <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-foreground">{t('setup.avxTitle')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t('setup.avxBody')}</p>
                    </div>
                  </div>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside ps-1">
                    <li>
                      {t('setup.avxStep1')}{' '}
                      <a
                        href="https://github.com/ggerganov/whisper.cpp/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 hover:text-primary/80"
                        onClick={(e) => {
                          e.preventDefault();
                          openUrl('https://github.com/ggerganov/whisper.cpp/releases');
                        }}
                      >
                        {t('setup.avxLink')}
                      </a>{' '}
                      {t('setup.avxStep1b')}
                    </li>
                    <li>{t('setup.avxStep2')}</li>
                  </ol>
                  <button onClick={clearError} className="text-xs text-muted-foreground underline">
                    {t('common.dismiss')}
                  </button>
                </div>
              )}

              {/* Generic error display */}
              {storeError && !storeError.includes('AVX2') && (
                <div className="flex items-center justify-between rounded-md bg-error/10 px-3 py-2 text-sm text-error">
                  <span className="truncate text-xs">{storeError}</span>
                  <button onClick={clearError} className="ms-2 shrink-0 text-xs underline">
                    {t('common.dismiss')}
                  </button>
                </div>
              )}

              {/* Can auto-install (Homebrew available on macOS) */}
              {whisperInstallStatus.canAutoInstall &&
                !isInstallingWhisper &&
                !isInstallingHomebrew && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">{t('setup.notFound')}</p>
                    <Button onClick={installWhisper} size="sm">
                      <Download className="h-4 w-4" />
                      {t('setup.installWhisper')}
                    </Button>
                  </div>
                )}

              {/* No Homebrew on macOS — install Homebrew first */}
              {!whisperInstallStatus.canAutoInstall &&
                whisperInstallStatus.platform === 'macos' &&
                !isInstallingHomebrew &&
                !isInstallingWhisper && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {t('setup.needBrew')}
                      {whisperInstallStatus.arch === 'x86_64' && (
                        <span className="block mt-1 text-warning">{t('setup.intelNote')}</span>
                      )}
                    </p>
                    <Button onClick={installHomebrew} size="sm">
                      <Download className="h-4 w-4" />
                      {t('setup.installBrew')}
                    </Button>
                  </div>
                )}

              {/* Installing Homebrew */}
              {isInstallingHomebrew && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">{t('setup.installingBrew')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('setup.fewMinutes')}</p>
                </div>
              )}

              {/* Installing Whisper */}
              {isInstallingWhisper && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">{t('setup.installingWhisper')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('setup.fewMinutes')}</p>
                </div>
              )}
            </div>
          )}

          {/* Manual setup toggle */}
          {!binaryPath && !isAutoDetecting && (
            <button
              onClick={() => setShowManualSetup(!showManualSetup)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
            >
              {showManualSetup ? t('setup.hideManual') : t('setup.showManual')}
            </button>
          )}

          {/* Manual setup (collapsed by default) */}
          {showManualSetup && !binaryPath && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{t('setup.manualBinaryBody')}</p>
              <div className="flex gap-2">
                <Input
                  value={binaryPath}
                  onChange={(e) => setBinaryPath(e.target.value)}
                  placeholder="/usr/local/bin/whisper-cli"
                  className="flex-1 font-mono text-sm"
                  dir="ltr"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleBrowseBinary}
                  aria-label={t('setup.browse')}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Model — Tabs */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">
              {t('setup.step2')}
            </Badge>
            <label className="text-sm font-medium text-foreground">{t('setup.model')}</label>
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setTab('download')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === 'download'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              {t('setup.tabDownload')}
            </button>
            <button
              onClick={() => setTab('manual')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === 'manual'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('setup.tabManual')}
            </button>
          </div>

          {/* Download Tab */}
          {tab === 'download' && (
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder={t('setup.searchModels')}
                  className="ps-8 h-8 text-sm"
                />
              </div>

              {isLoadingModels ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-2 max-h-[400px] overflow-y-auto pe-1">
                  {availableModels
                    .filter((m) => {
                      if (!modelSearch.trim()) return true;
                      const q = modelSearch.toLowerCase();
                      return (
                        m.id.toLowerCase().includes(q) ||
                        m.name.toLowerCase().includes(q) ||
                        m.description.toLowerCase().includes(q)
                      );
                    })
                    .map((model) => (
                      <ModelRow
                        key={model.id}
                        model={model}
                        isDownloading={isDownloading}
                        downloadProgress={
                          downloadProgress?.modelId === model.id ? downloadProgress : null
                        }
                        onDownload={() => handleDownloadAndConfigure(model.id)}
                        onDelete={() => deleteModel(model.id)}
                        onSelect={() =>
                          model.localPath && handleSelectDownloadedModel(model.localPath, model.id)
                        }
                        isActive={modelPath === model.localPath && !!model.localPath}
                      />
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Manual Tab */}
          {tab === 'manual' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t('setup.manualModelBody')}</p>
              <div className="flex gap-2">
                <Input
                  value={modelPath}
                  onChange={(e) => setModelPath(e.target.value)}
                  placeholder="/path/to/models/ggml-base.bin"
                  className="flex-1 font-mono text-sm"
                  dir="ltr"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleBrowseModel}
                  aria-label={t('setup.browse')}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('setup.modelName')}</label>
                <Input
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="base"
                  className="max-w-[200px]"
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <Button onClick={handleSave} disabled={!isValid || isConfiguringWhisper}>
          {isConfiguringWhisper ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('setup.validating')}
            </>
          ) : (
            t('setup.save')
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ── Model Row Component ───────────────────────────────────

function ModelRow({
  model,
  isDownloading,
  downloadProgress,
  onDownload,
  onDelete,
  onSelect,
  isActive,
}: {
  model: {
    id: string;
    name: string;
    sizeMb: number;
    description: string;
    isEnglishOnly: boolean;
    isDownloaded: boolean;
    speed: string;
    accuracy: string;
  };
  isDownloading: boolean;
  downloadProgress: { percent: number; downloadedBytes: number; totalBytes: number } | null;
  onDownload: () => void;
  onDelete: () => void;
  onSelect: () => void;
  isActive: boolean;
}) {
  const { t } = useTranslation('caption');
  const isThisDownloading = downloadProgress !== null;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
        isActive
          ? 'border-primary/50 bg-primary/5'
          : model.isDownloaded
            ? 'border-success/30 bg-success/5'
            : 'border-border'
      }`}
    >
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
        {model.isDownloaded ? (
          <HardDrive className="h-4 w-4 text-success" />
        ) : (
          <Globe className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{model.name}</span>
          <span className="text-xs text-muted-foreground">{formatSize(model.sizeMb)}</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            <Globe className="h-2.5 w-2.5 me-0.5" />
            {t('row.langs')}
          </Badge>
          {isActive && (
            <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
              {t('row.active')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Zap className="h-3 w-3" />
            {speedLabel(t, model.speed)}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Target className="h-3 w-3" />
            {model.accuracy}
          </span>
        </div>

        {/* Download Progress */}
        {isThisDownloading && (
          <div className="mt-1.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {Math.round(downloadProgress.percent)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {model.isDownloaded ? (
          <>
            {!isActive && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSelect}>
                <Monitor className="h-3 w-3" />
                {t('row.use')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5"
              onClick={onDelete}
              disabled={isActive}
              aria-label={t('row.delete')}
            >
              <Trash2 className="h-3.5 w-3.5 text-error" />
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onDownload}
            disabled={isDownloading}
          >
            {isThisDownloading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Download className="h-3 w-3" />
                {t('row.download')}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function formatSize(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
}
