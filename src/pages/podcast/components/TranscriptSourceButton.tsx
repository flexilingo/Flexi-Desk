import { useState } from 'react';
import {
  ChevronDown,
  Cloud,
  CloudOff,
  Check,
  Loader2,
  Mic,
  HardDrive,
  Download,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TranscriptSourceInfo } from '../types';

interface Props {
  info: TranscriptSourceInfo | null;
  /** True while Whisper is running locally. */
  isTranscribing: boolean;
  isDownloading: boolean;
  isFetchingCloud: boolean;
  /** Whether the episode audio is already on disk. */
  isDownloaded: boolean;
  onTranscribeLocally: () => void;
  /** Downloads the cloud transcript for the first time. */
  onUseCloud: () => void;
  onSwitchToSource: (source: 'local' | 'cloud') => void;
}

/**
 * Subtitle-source control.
 *
 * When FlexiLingo already has the episode analyzed, that transcript is loaded and
 * shown, and there is nothing to download — so we do NOT push a loud
 * "Download & transcribe" button at the user. It collapses to a quiet chip naming
 * the active source, and transcribing locally (which is the only way to get
 * word-level timing) moves into the dropdown.
 *
 * The big download button only appears when there is no transcript at all.
 */
export function TranscriptSourceButton({
  info,
  isTranscribing,
  isDownloading,
  isFetchingCloud,
  isDownloaded,
  onTranscribeLocally,
  onUseCloud,
  onSwitchToSource,
}: Props) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);

  const busy = isTranscribing || isDownloading || isFetchingCloud;
  const hasLocal = info?.has_local ?? false;
  const hasCloud = info?.has_cloud ?? false;
  const cloudPossible = info?.cloud_possible ?? false;
  const cloudUnavailable = info?.cloud_status === 'unavailable';
  const cloudUsable = cloudPossible && !cloudUnavailable;
  const active = info?.active ?? 'local';

  const hasAnyTranscript = hasLocal || hasCloud;

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const dropdown = (
    <PopoverContent align="end" className="w-72 p-1.5">
      <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('podcast.transcriptSource')}
      </p>

      <SourceOption
        icon={HardDrive}
        title={hasLocal ? t('podcast.sourceLocalTitle') : t('podcast.transcribeOnDevice')}
        hint={hasLocal ? t('podcast.sourceLocalHint') : t('podcast.sourceLocalHint')}
        active={active === 'local' && hasLocal}
        // With no local transcript this is an action, not a switch.
        onClick={() => run(hasLocal ? () => onSwitchToSource('local') : onTranscribeLocally)}
      />

      <SourceOption
        icon={cloudUsable ? Cloud : CloudOff}
        title={t('podcast.sourceCloudTitle')}
        hint={
          !cloudPossible
            ? t('podcast.sourceCloudImpossible')
            : cloudUnavailable
              ? t('podcast.sourceCloudUnavailable')
              : hasCloud
                ? t('podcast.sourceCloudCached')
                : t('podcast.sourceCloudHint')
        }
        active={active === 'cloud' && hasCloud}
        disabled={!cloudUsable}
        // Already cached → just re-activate it, no network.
        onClick={() => run(hasCloud ? () => onSwitchToSource('cloud') : onUseCloud)}
      />
    </PopoverContent>
  );

  // ── A transcript is showing: quiet chip + dropdown, no download button ──
  if (hasAnyTranscript) {
    const ActiveIcon = active === 'cloud' ? Cloud : HardDrive;
    const activeLabel =
      active === 'cloud' ? t('podcast.sourceCloudTitle') : t('podcast.sourceLocalTitle');

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ActiveIcon className="h-4 w-4" />
            )}
            {activeLabel}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
        </PopoverTrigger>
        {dropdown}
      </Popover>
    );
  }

  // ── Nothing to show yet: offer the local transcription up front ──
  const primaryLabel = isDownloading
    ? t('podcast.downloading')
    : isTranscribing
      ? t('podcast.transcribing')
      : isFetchingCloud
        ? t('podcast.loadingCloudTranscript')
        : isDownloaded
          ? t('podcast.transcribeOnDevice')
          : t('podcast.downloadAndTranscribe');

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-border">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onTranscribeLocally}
        className="rounded-none border-0"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isDownloaded ? (
          <Mic className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {primaryLabel}
      </Button>

      <span aria-hidden className="w-px bg-border" />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={t('podcast.transcriptSource')}
            className="w-9 rounded-none border-0 px-0"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        {dropdown}
      </Popover>
    </div>
  );
}

function SourceOption({
  icon: Icon,
  title,
  hint,
  active,
  disabled,
  onClick,
}: {
  icon: typeof Cloud;
  title: string;
  hint: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted',
      )}
    >
      <Icon
        className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {active && <Check className="h-3.5 w-3.5 text-primary" />}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
