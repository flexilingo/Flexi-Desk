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
import { Trans, useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation('podcastUi');
  const navigate = useNavigate();
  const [isSwitching, setSwitching] = useState(false);
  const [isDownloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!compatibility) return null;

  const models = compatibility.suggested_models.map(mapAvailableModel);
  const downloadedModels = models.filter((m) => m.isDownloaded);
  const normalizedLang = feedLanguage.split(/[-_]/)[0].toLowerCase();
  let langName = feedLanguage;
  try {
    langName =
      new Intl.DisplayNames([i18n.language], { type: 'language' }).of(normalizedLang) ??
      feedLanguage;
  } catch {
    // unknown code: show it as-is
  }

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
        setError(t('modelSuggestion.notConfigured'));
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
            <AlertTriangle className="h-5 w-5 text-warning" />
            {t('modelSuggestion.title')}
          </DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="modelSuggestion.description"
              ns="podcastUi"
              values={{
                model: compatibility.current_model ?? t('modelSuggestion.unknownModel'),
                language: langName,
              }}
              components={{
                m: <strong className="text-foreground" />,
                l: <strong className="text-foreground" />,
              }}
            />
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
                {t('modelSuggestion.availableOnDevice')}
              </p>
              {downloadedModels.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-3"
                >
                  <HardDrive className="h-4 w-4 shrink-0 text-success" />
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
                        {t('modelSuggestion.switchAndTranscribe')}
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
                {t('modelSuggestion.noneDownloaded')}
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
                        {t('modelSuggestion.recommended')}
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
                      {t('modelSuggestion.downloading')}
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1" />
                      {t('modelSuggestion.downloadAndUse')}
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
            {t('modelSuggestion.allModels')}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isDownloading}>
            {t('shared.cancel')}
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
