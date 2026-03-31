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
  Info,
  ChevronDown,
  ChevronUp,
  Languages,
  AlertCircle,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { open as openUrl } from '@tauri-apps/plugin-shell';
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
import { mapDownloadProgress } from '../types';

type SetupTab = 'download' | 'manual';

interface WhisperSetupProps {
  onClose?: () => void;
}

export function WhisperSetup({ onClose }: WhisperSetupProps) {
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
    } else if (!whisperInfo?.isAvailable && whisperInstallStatus?.binaryDetected && whisperInstallStatus.binaryPath) {
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
    const unlisten = listen<{ status: string; message: string; percent: number }>('whisper-install-progress', (event) => {
      useCaptionStore.getState().setWhisperInstallMessage(event.payload.message);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleBrowseBinary = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: 'Select whisper.cpp binary',
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
        title: 'Select Whisper model file (.bin)',
        filters: [{ name: 'Whisper Model', extensions: ['bin'] }],
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
            <Button variant="ghost" size="icon" onClick={onClose ?? (() => setView('sessions'))}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Whisper Setup</CardTitle>
            <CardDescription>
              Live Caption uses whisper.cpp for speech-to-text. All models support 99+ languages.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Success state */}
        {whisperInfo?.isAvailable && (
          <div className="flex items-center gap-2 rounded-md bg-[#8BB7A3]/10 px-3 py-2 text-sm text-[#8BB7A3]">
            <CheckCircle2 className="h-4 w-4" />
            Whisper is configured and ready
          </div>
        )}

        {/* Info Section */}
        <div className="rounded-lg border border-primary/20 bg-primary/5">
          <button
            onClick={() => setInfoExpanded(!infoExpanded)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
          >
            <Languages className="h-4 w-4 text-primary shrink-0" />
            <span className="flex-1 text-sm font-medium text-foreground">
              All models support 99+ languages — which one should I pick?
            </span>
            {infoExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {infoExpanded && (
            <div className="border-t border-primary/10 px-3 py-3 space-y-3 text-xs text-muted-foreground">
              <p>
                Whisper is an open-source speech-to-text engine by OpenAI. Every model listed here
                is <strong className="text-foreground">multilingual</strong> and supports{' '}
                <strong className="text-foreground">99+ languages</strong> including English,
                Persian, Arabic, French, Spanish, Chinese, Japanese, Korean, German, Hindi, Russian,
                Turkish, and many more.
              </p>
              <div className="space-y-1.5">
                <p className="font-medium text-foreground">How to choose:</p>
                <ul className="space-y-1 ml-3 list-disc">
                  <li>
                    <strong className="text-foreground">Tiny / Base</strong> — Fast, low resource
                    usage. Good for quick tests or older hardware.
                  </li>
                  <li>
                    <strong className="text-foreground">Small / Medium</strong> — Balanced. Good
                    accuracy for most languages.
                  </li>
                  <li>
                    <strong className="text-foreground">Large v3 Turbo</strong> —{' '}
                    <span className="text-[#8BB7A3] font-medium">Recommended.</span> Near-best
                    accuracy with significantly faster speed than full Large models.
                  </li>
                  <li>
                    <strong className="text-foreground">Large v3</strong> — Highest accuracy, but
                    slowest. Use if you need maximum precision and have a powerful machine.
                  </li>
                </ul>
              </div>
              <div className="space-y-1.5">
                <p className="font-medium text-foreground">What are Q5 / Q8 variants?</p>
                <p>
                  Quantized versions that are{' '}
                  <strong className="text-foreground">smaller in size</strong> with nearly identical
                  accuracy. Q8 is closer to the original; Q5 is the smallest. Great if you want to
                  save disk space.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Step 1: Binary Path — Auto-detect + Install */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">
              Step 1
            </Badge>
            <label className="text-sm font-medium text-foreground">Whisper Binary</label>
          </div>

          {/* Auto-detecting */}
          {isAutoDetecting && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Detecting whisper-cli...
            </div>
          )}

          {/* Binary already configured */}
          {binaryPath && !isAutoDetecting && (
            <div className="flex items-center gap-2 rounded-md bg-[#8BB7A3]/10 px-3 py-2 text-sm text-[#8BB7A3]">
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
                      <p className="text-xs font-semibold text-foreground">CPU not compatible with this build</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Your processor (pre-2013) doesn't support AVX2 instructions required by the
                        pre-built Whisper binary.
                      </p>
                    </div>
                  </div>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside pl-1">
                    <li>
                      Download a compatible build from{' '}
                      <a
                        href="https://github.com/ggerganov/whisper.cpp/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 hover:text-primary/80"
                        onClick={(e) => { e.preventDefault(); openUrl('https://github.com/ggerganov/whisper.cpp/releases'); }}
                      >
                        whisper.cpp releases
                      </a>
                      {' '}(look for a noavx or compat build, or build from source).
                    </li>
                    <li>Use <strong>Custom binary path</strong> below to point to your installed binary.</li>
                  </ol>
                  <button onClick={clearError} className="text-xs text-muted-foreground underline">
                    Dismiss
                  </button>
                </div>
              )}

              {/* Generic error display */}
              {storeError && !storeError.includes('AVX2') && (
                <div className="flex items-center justify-between rounded-md bg-error/10 px-3 py-2 text-sm text-error">
                  <span className="truncate text-xs">{storeError}</span>
                  <button onClick={clearError} className="ml-2 shrink-0 text-xs underline">
                    Dismiss
                  </button>
                </div>
              )}

              {/* Can auto-install (Homebrew available on macOS) */}
              {whisperInstallStatus.canAutoInstall && !isInstallingWhisper && !isInstallingHomebrew && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    whisper-cli was not found on your system. Click below to install it automatically.
                  </p>
                  <Button onClick={installWhisper} className="w-full" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Install Whisper
                  </Button>
                </div>
              )}

              {/* No Homebrew on macOS — install Homebrew first */}
              {!whisperInstallStatus.canAutoInstall && whisperInstallStatus.platform === 'macos' && !isInstallingHomebrew && !isInstallingWhisper && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Homebrew (macOS package manager) is needed to install Whisper.
                    {whisperInstallStatus.arch === 'x86_64' && (
                      <span className="block mt-1 text-warning">
                        Note: On Intel Macs, Homebrew installation may require your password.
                      </span>
                    )}
                  </p>
                  <Button onClick={installHomebrew} className="w-full" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Install Homebrew
                  </Button>
                </div>
              )}

              {/* Installing Homebrew */}
              {isInstallingHomebrew && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">Installing Homebrew...</span>
                  </div>
                  <p className="text-xs text-muted-foreground">This may take a few minutes.</p>
                </div>
              )}

              {/* Installing Whisper */}
              {isInstallingWhisper && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">Installing Whisper...</span>
                  </div>
                  <p className="text-xs text-muted-foreground">This may take a few minutes.</p>
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
              {showManualSetup ? 'Hide manual setup' : 'Manual setup (advanced)'}
            </button>
          )}

          {/* Manual setup (collapsed by default) */}
          {showManualSetup && !binaryPath && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">
                Browse for an existing whisper-cli binary on your system.
              </p>
              <div className="flex gap-2">
                <Input
                  value={binaryPath}
                  onChange={(e) => setBinaryPath(e.target.value)}
                  placeholder="/usr/local/bin/whisper-cli"
                  className="flex-1 font-mono text-sm"
                />
                <Button variant="outline" size="icon" onClick={handleBrowseBinary}>
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
              Step 2
            </Badge>
            <label className="text-sm font-medium text-foreground">Whisper Model</label>
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setTab('download')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === 'download'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              Download Model
            </button>
            <button
              onClick={() => setTab('manual')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === 'manual'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Manual Path
            </button>
          </div>

          {/* Download Tab */}
          {tab === 'download' && (
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Search models... (e.g. turbo, large, q5, EN)"
                  className="pl-8 h-8 text-sm"
                />
              </div>

              {isLoadingModels ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-1">
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
              <p className="text-xs text-muted-foreground">
                Point to an existing GGML model file (
                <code className="bg-muted px-1 rounded">.bin</code>)
              </p>
              <div className="flex gap-2">
                <Input
                  value={modelPath}
                  onChange={(e) => setModelPath(e.target.value)}
                  placeholder="/path/to/models/ggml-base.bin"
                  className="flex-1 font-mono text-sm"
                />
                <Button variant="outline" size="icon" onClick={handleBrowseModel}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Model Name (optional)</label>
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
              Validating…
            </>
          ) : (
            'Save Configuration'
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
  const isThisDownloading = downloadProgress !== null;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
        isActive
          ? 'border-primary/50 bg-primary/5'
          : model.isDownloaded
            ? 'border-[#8BB7A3]/30 bg-[#8BB7A3]/5'
            : 'border-border'
      }`}
    >
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
        {model.isDownloaded ? (
          <HardDrive className="h-4 w-4 text-[#8BB7A3]" />
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
            <Globe className="h-2.5 w-2.5 mr-0.5" />
            99+ langs
          </Badge>
          {isActive && (
            <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
              Active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Zap className="h-3 w-3" />
            {model.speed}
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
                <Monitor className="h-3 w-3 mr-1" />
                Use
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5"
              onClick={onDelete}
              disabled={isActive}
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
                <Download className="h-3 w-3 mr-1" />
                Download
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
