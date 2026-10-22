import { useTranslation } from 'react-i18next';
import { CheckCircle2, Cloud, Download, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * This computer's tools for an episode (desk only — the website makes subtitles on its server):
 * keep the audio for offline listening, set up the on-device transcriber, and share a transcript
 * made here. They sit where the website shows its "make subtitles" status: in the status card when
 * there are no lines, and at the foot of Subtitle settings when there are.
 */
export function LocalSubtitleTools({
  isDownloaded,
  isDownloading,
  downloadPercent,
  onDownload,
  onWhisperSettings,
  onShareToCloud,
}: {
  isDownloaded: boolean;
  isDownloading: boolean;
  downloadPercent: number | null;
  onDownload: () => void;
  onWhisperSettings?: () => void;
  onShareToCloud?: () => void;
}) {
  const { t } = useTranslation('podcastUi');
  return (
    <>
      {isDownloaded ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t('np.savedOffline')}
        </span>
      ) : (
        <Button variant="outline" size="sm" onClick={onDownload} loading={isDownloading}>
          {!isDownloading && <Download className="h-3.5 w-3.5" />}
          {isDownloading && downloadPercent !== null && downloadPercent > 0
            ? `${t('np.downloadOffline')} ${Math.round(downloadPercent)}%`
            : t('np.downloadOffline')}
        </Button>
      )}
      {onShareToCloud && (
        <Button variant="outline" size="sm" onClick={onShareToCloud}>
          <Cloud className="h-3.5 w-3.5" />
          {t('np.shareToCloud')}
        </Button>
      )}
      {onWhisperSettings && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onWhisperSettings}
          title={t('np.whisperSettings')}
          aria-label={t('np.whisperSettings')}
        >
          <Settings />
        </Button>
      )}
    </>
  );
}
