import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Captions,
  FileText,
  Headphones,
  Loader2,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`;
}

export const MINI_ICON_BUTTON =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';
export const MINI_ICON_ACTIVE =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary-light/40 bg-primary-light/15 text-primary transition-colors';
const PLAY_BUTTON =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-colors hover:bg-accent/90';

/**
 * The bottom mini player bar (website: `GlobalMiniPlayer` + `MiniPlayerContent`): docked full width
 * under every page, a seek line on its top edge, the artwork and title (expands to the full player),
 * the transport in the middle, and CC, the subtitle state, volume, expand and close on the right.
 * The optional subtitle line sits above it.
 *
 * Every source of the one player uses it: a podcast, a textbook recording (line steps), and a
 * library book read aloud (sentence steps, a position instead of the clock, its own controls).
 */
export function MiniPlayerBar({
  title,
  showName,
  image,
  isPlaying,
  isLoading = false,
  currentTime,
  duration,
  volume,
  playbackError = false,
  onPlayPause,
  onSkip,
  onSeek,
  onVolumeChange,
  onExpand,
  expandLabel,
  onExit,
  lineSteps,
  hasTranscription = false,
  ccEnabled = false,
  onToggleCC,
  ccLock,
  isProcessing = false,
  onTranscribe,
  subtitleLine,
  position,
  extraControls,
  playLabel,
}: {
  title: string;
  showName?: string | null;
  image?: string | null;
  isPlaying: boolean;
  isLoading?: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackError?: boolean;
  onPlayPause: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onExpand: () => void;
  /** What expanding opens (the full player; a book track's book). */
  expandLabel?: string;
  onExit: () => void;
  /**
   * A line back / forward in place of -5s / +5s, where the line times are known (book tracks) —
   * or a sentence back / forward (a book read aloud), with its own names.
   */
  lineSteps?: {
    onPrev: () => void;
    onNext: () => void;
    prevLabel?: string;
    nextLabel?: string;
  } | null;
  hasTranscription?: boolean;
  ccEnabled?: boolean;
  onToggleCC?: () => void;
  /** A book track whose subtitles are not open yet. */
  ccLock?: ReactNode;
  isProcessing?: boolean;
  /** No transcript yet: make one (opens the player, where the subtitles are made). */
  onTranscribe?: () => void;
  subtitleLine?: ReactNode;
  /** In place of the clock: where the player is ("7 of 42 · page 1 of 11"). */
  position?: ReactNode;
  /** The source's own controls, before the volume (speed, repeat). */
  extraControls?: ReactNode;
  /** The play button's tooltip (its keyboard shortcut). */
  playLabel?: string;
}) {
  const { t } = useTranslation('podcastUi');
  const [showVolume, setShowVolume] = useState(false);
  const [failedArtwork, setFailedArtwork] = useState<string | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isMuted = volume === 0;
  const expand = expandLabel ?? t('np.expandPlayer');

  const playIcon = isLoading ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : isPlaying ? (
    <Pause className="h-4 w-4 fill-current" />
  ) : (
    <Play className="ms-0.5 h-4 w-4 fill-current" />
  );

  return (
    <div className="relative z-40 flex shrink-0 flex-col">
      {subtitleLine}
      <div
        dir="ltr"
        className="relative select-none border-t-2 border-t-primary-light/40 bg-muted/90 shadow-md backdrop-blur-md"
      >
        <div
          ref={progressRef}
          onClick={(e) => {
            const rect = progressRef.current?.getBoundingClientRect();
            if (!rect || duration <= 0) return;
            onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
          }}
          className="group absolute inset-x-0 top-0 h-1 cursor-pointer bg-input"
        >
          <div
            className="h-full bg-gradient-to-r from-olive-600 to-olive-500 transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex h-16 items-center gap-3 px-5">
          <button
            type="button"
            onClick={onExpand}
            title={expand}
            className="group flex w-72 min-w-0 items-center gap-3 text-start"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card">
              {image && failedArtwork !== image ? (
                <img
                  src={image}
                  alt={title}
                  className="h-full w-full object-cover"
                  onError={() => setFailedArtwork(image)}
                />
              ) : (
                <Headphones className="h-4 w-4 text-primary-light" strokeWidth={1.75} />
              )}
            </span>
            <span className="min-w-0">
              <span
                dir="auto"
                className="block truncate text-start text-sm font-semibold text-foreground transition-colors group-hover:text-primary-light"
              >
                {title}
              </span>
              {playbackError ? (
                <span className="flex items-center gap-1 truncate text-xs text-error">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {t('np.audioUnavailableShort')}
                </span>
              ) : (
                showName && (
                  <span
                    dir="auto"
                    className="block truncate text-start text-xs text-muted-foreground"
                  >
                    {showName}
                  </span>
                )
              )}
            </span>
          </button>

          <div className="flex flex-1 items-center justify-center gap-1.5">
            {lineSteps ? (
              <button
                type="button"
                onClick={lineSteps.onPrev}
                title={lineSteps.prevLabel ?? t('np.prevLineHint')}
                aria-label={lineSteps.prevLabel ?? t('np.prevLine')}
                className={MINI_ICON_BUTTON}
                disabled={playbackError}
              >
                <SkipBack className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSkip(-5)}
                title="-5s"
                aria-label="-5s"
                className={MINI_ICON_BUTTON}
                disabled={playbackError}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            {playbackError ? (
              <div
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error text-error-foreground"
                title={t('np.audioUnavailableShort')}
              >
                <AlertCircle className="h-4 w-4" />
              </div>
            ) : (
              <button
                type="button"
                onClick={onPlayPause}
                aria-label={isPlaying ? t('np.pause') : t('np.play')}
                title={playLabel}
                className={PLAY_BUTTON}
              >
                {playIcon}
              </button>
            )}
            {lineSteps ? (
              <button
                type="button"
                onClick={lineSteps.onNext}
                title={lineSteps.nextLabel ?? t('np.nextLineHint')}
                aria-label={lineSteps.nextLabel ?? t('np.nextLine')}
                className={MINI_ICON_BUTTON}
                disabled={playbackError}
              >
                <SkipForward className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSkip(5)}
                title="+5s"
                aria-label="+5s"
                className={MINI_ICON_BUTTON}
                disabled={playbackError}
              >
                <RotateCw className="h-4 w-4" />
              </button>
            )}
            {position ?? (
              <span className="ms-2 whitespace-nowrap text-xs tabular-nums">
                <span className="font-semibold text-foreground">{formatTime(currentTime)}</span>
                <span className="text-caption"> / {formatTime(duration)}</span>
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {hasTranscription && onToggleCC && (
              <button
                type="button"
                onClick={onToggleCC}
                title={t('np.ccLabel')}
                aria-label={t('np.ccLabel')}
                aria-pressed={ccEnabled}
                className={ccEnabled ? MINI_ICON_ACTIVE : MINI_ICON_BUTTON}
              >
                <Captions className="h-4 w-4" />
              </button>
            )}
            {ccLock}
            {extraControls}
            {isProcessing && (
              <span title={t('np.transcribing')} className={MINI_ICON_BUTTON}>
                <Loader2 className="h-4 w-4 animate-spin text-warning" />
              </span>
            )}
            {onTranscribe && (
              <button
                type="button"
                onClick={onTranscribe}
                title={t('np.transcribe')}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-xs font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent/90"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden lg:inline">{t('np.transcribe')}</span>
              </button>
            )}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowVolume((v) => !v)}
                className={MINI_ICON_BUTTON}
                title={t('np.volume')}
                aria-label={t('np.volume')}
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : volume < 0.5 ? (
                  <Volume1 className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              {showVolume && (
                <div className="absolute bottom-full end-0 z-[1000] mb-2 flex min-w-[80px] flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-md">
                  <div
                    className="relative h-20 w-2 cursor-pointer rounded-full bg-input"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      onVolumeChange(
                        Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height)),
                      );
                    }}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-terra-400 to-terra-500 transition-[height] duration-100"
                      style={{ height: `${volume * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold tabular-nums text-foreground">
                    {Math.round(volume * 100)}%
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-border bg-muted px-2 py-1 text-[10px] text-foreground transition-colors hover:bg-card"
                    onClick={() => onVolumeChange(isMuted ? 1 : 0)}
                  >
                    {isMuted ? t('np.unmute') : t('np.mute')}
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onExpand}
              className={MINI_ICON_BUTTON}
              title={expand}
              aria-label={expand}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onExit}
              className={MINI_ICON_BUTTON}
              title={t('np.closePlayer')}
              aria-label={t('np.closePlayer')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
