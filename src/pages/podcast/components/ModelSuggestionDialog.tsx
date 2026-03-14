import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Download,
  Loader2,
  Monitor,
  Settings,
  Zap,
  Target,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type {
  RawModelCompatibility,
  RawAvailableModel,
  AvailableModel,
  RawDownloadProgress,
} from '@/pages/caption/types';
import { mapAvailableModel, mapDownloadProgress } from '@/pages/caption/types';
import { useCaptionStore } from '@/pages/caption';
import { listen } from '@tauri-apps/api/event';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fa: 'Persian',
  ar: 'Arabic',
  tr: 'Turkish',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
  hi: 'Hindi',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  el: 'Greek',
  cs: 'Czech',
  ro: 'Romanian',
  hu: 'Hungarian',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  he: 'Hebrew',
  uk: 'Ukrainian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sk: 'Slovak',
  sl: 'Slovenian',
  sr: 'Serbian',
  lt: 'Lithuanian',
  lv: 'Latvian',
  et: 'Estonian',
  auto: 'Auto-detect',
};

interface ModelSuggestionDialogProps {
  open: boolean;
  onClose: () => void;
  compatibility: RawModelCompatibility | null;
  feedLanguage: string;
  onModelSwitched: () => void;
}

export function ModelSuggestionDialog({
  open,
  onClose,
  compatibility,
  feedLanguage,
  onModelSwitched,
}: ModelSuggestionDialogProps) {
  const navigate = useNavigate();
  const [isSwitching, setSwitching] = useState(false);
  const [isDownloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!compatibility) return null;

  const models = compatibility.suggested_models.map(mapAvailableModel);
  const downloadedModels = models.filter((m) => m.isDownloaded);
  const normalizedLang = feedLanguage.split(/[-_]/)[0].toLowerCase();
  const langName = LANGUAGE_NAMES[normalizedLang] ?? feedLanguage;

  // Find the recommended model (prefer turbo, then by downloaded status)
  const recommendedModel =
    models.find((m) => m.id === 'large-v3-turbo') ??
    models.find((m) => m.id === 'base') ??
    models[0];

  const handleSwitchModel = async (model: AvailableModel) => {
    if (!model.localPath) return;
    setSwitching(true);
    setError(null);
    try {
      // Get current binary path
      const whisperInfo = useCaptionStore.getState().whisperInfo;
      if (!whisperInfo?.binaryPath) {
        setError('Whisper binary not configured.');
        setSwitching(false);
        return;
      }
      await invoke('caption_configure_whisper', {
        binaryPath: whisperInfo.binaryPath,
        modelPath: model.localPath,
        modelName: model.id,
      });
      // Refresh whisper info in store
      await useCaptionStore.getState().checkWhisper();
      onModelSwitched();
    } catch (err) {
      setError(String(err));
    } finally {
      setSwitching(false);
    }
  };

  const handleDownloadAndSwitch = async (model: AvailableModel) => {
    setDownloading(true);
    setDownloadProgress(0);
    setError(null);

    // Listen for download progress
    const unlisten = await listen<RawDownloadProgress>('whisper-download-progress', (event) => {
      const progress = mapDownloadProgress(event.payload);
      if (progress.modelId === model.id) {
        setDownloadProgress(progress.percent);
      }
    });

    try {
      const path = await invoke<string>('caption_download_model', { modelId: model.id });

      // Auto-configure after download
      const whisperInfo = useCaptionStore.getState().whisperInfo;
      if (whisperInfo?.binaryPath) {
        await invoke('caption_configure_whisper', {
          binaryPath: whisperInfo.binaryPath,
          modelPath: path,
          modelName: model.id,
        });
        await useCaptionStore.getState().checkWhisper();
        onModelSwitched();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      unlisten();
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleGoToSettings = () => {
    onClose();
    navigate('/settings?tab=whisper');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#C58C6E]" />
            Incompatible Whisper Model
          </DialogTitle>
          <DialogDescription>
            Your current model{' '}
            <strong className="text-foreground">{compatibility.current_model ?? 'unknown'}</strong>{' '}
            only supports English, but this podcast is in{' '}
            <strong className="text-foreground">{langName}</strong>. Switch to a multilingual model
            to transcribe it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Error */}
          {error && (
            <div className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">{error}</div>
          )}

          {/* Downloaded compatible models */}
          {downloadedModels.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Available multilingual models on your device:
              </p>
              {downloadedModels.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center gap-3 rounded-lg border border-[#8BB7A3]/30 bg-[#8BB7A3]/5 p-3"
                >
                  <HardDrive className="h-4 w-4 shrink-0 text-[#8BB7A3]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{model.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatSize(model.sizeMb)}
                      </span>
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
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleSwitchModel(model)}
                    disabled={isSwitching || isDownloading}
                  >
                    {isSwitching ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Monitor className="h-3 w-3 mr-1" />
                        Switch & Transcribe
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Recommended model to download */}
          {downloadedModels.length === 0 && recommendedModel && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                No multilingual model downloaded. We recommend:
              </p>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{recommendedModel.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatSize(recommendedModel.sizeMb)}
                      </span>
                      <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
                        Recommended
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {recommendedModel.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Zap className="h-3 w-3" />
                        {recommendedModel.speed}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Target className="h-3 w-3" />
                        {recommendedModel.accuracy}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Download progress */}
                {isDownloading && downloadProgress !== null && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {Math.round(downloadProgress)}%
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  className="mt-2 w-full"
                  size="sm"
                  onClick={() => handleDownloadAndSwitch(recommendedModel)}
                  disabled={isDownloading || isSwitching}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Download & Use
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={handleGoToSettings} disabled={isDownloading}>
            <Settings className="h-3.5 w-3.5 mr-1" />
            All Models
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isDownloading}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatSize(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
}
