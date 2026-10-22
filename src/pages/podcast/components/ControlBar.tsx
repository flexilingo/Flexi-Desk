import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Captions,
  CaptionsOff,
  Languages,
  Library,
  Loader2,
  Maximize,
  MessageCircle,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  SkipBack,
  SkipForward,
  Timer,
  Volume1,
  Volume2,
  VolumeX,
  Waypoints,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SPEED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** Lines shown before and after the spoken one; null = as many as fit (website: CONTEXT_LINE_CHOICES). */
export const CONTEXT_LINE_CHOICES: (number | null)[] = [0, 1, 2, 3, null];
// A tool's cell in the balanced tools rows, by tools per row (literal classes).
const TOOL_CELL: Record<number, string> = { 1: 'w-full', 2: 'w-1/2', 3: 'w-1/3', 4: 'w-1/4' };

interface ControlBarProps {
  isPlaying: boolean;
  /** Play was asked for and the sound is not there yet: a spinner on the play button. */
  isLoading?: boolean;
  currentTime: number;
  duration: number;
  /** Length to show until the media reports its own. */
  fallbackDuration?: number;
  volume: number;
  playbackRate: number;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onSeekTo: (time: number) => void;
  /** A line back / forward; absent, the buttons move 5 seconds. */
  onPrevLine?: () => void;
  onNextLine?: () => void;
  onToggleMute: () => void;
  onSpeedChange: (rate: number) => void;
  onVolumeChange: (volume: number) => void;
  /**
   * "card": the now-playing card — scrubber, transport, the tools in at most two balanced rows.
   * "strip": a video in full screen — one slim row under the picture.
   */
  layout?: 'card' | 'strip';
  hasCurrentSegment?: boolean;
  onVocab?: () => void;
  onTranslateSentence?: () => void;
  onAnalyzeSentence?: () => void;
  onSyncClick?: () => void;
  onPictureInPicture?: () => void;
  pipActive?: boolean;
  /** A video's full screen (F). */
  onToggleFullscreen?: () => void;
  fullscreen?: boolean;
  /** Opens the Listening Program picker. */
  onOpenProgram?: () => void;
  // Subtitle settings
  subtitlesEnabled?: boolean;
  onToggleSubtitles?: () => void;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  contextLines?: number | null;
  onContextLinesChange?: (lines: number | null) => void;
  autoPauseOnSubtitle?: boolean;
  onToggleAutoPause?: () => void;
  pauseOnWordHover?: boolean;
  onTogglePauseOnWordHover?: () => void;
  /** Where these subtitles come from, and this computer's copy (desk only), under the settings. */
  subtitleSourceSlot?: ReactNode;
}

/** The now-playing transport and tools (website: `ControlBar`, layouts "card" and "strip"). */
export function ControlBar({
  isPlaying,
  isLoading = false,
  currentTime,
  duration,
  fallbackDuration = 0,
  volume,
  playbackRate,
  onPlayPause,
  onSeek,
  onSeekTo,
  onPrevLine,
  onNextLine,
  onToggleMute,
  onSpeedChange,
  onVolumeChange,
  layout = 'card',
  hasCurrentSegment = false,
  onVocab,
  onTranslateSentence,
  onAnalyzeSentence,
  onSyncClick,
  onPictureInPicture,
  pipActive = false,
  onToggleFullscreen,
  fullscreen = false,
  onOpenProgram,
  subtitlesEnabled = true,
  onToggleSubtitles,
  fontSize = 35,
  onFontSizeChange,
  contextLines = null,
  onContextLinesChange,
  autoPauseOnSubtitle = false,
  onToggleAutoPause,
  pauseOnWordHover = false,
  onTogglePauseOnWordHover,
  subtitleSourceSlot,
}: ControlBarProps) {
  const { t } = useTranslation('podcastUi');
  const { t: tl } = useTranslation('listening');
  const [speedOpen, setSpeedOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [subtitleOpen, setSubtitleOpen] = useState(false);

  const back = onPrevLine
    ? { label: t('np.prevLine'), hint: t('np.prevLineHint'), onClick: onPrevLine }
    : { label: '-5s', hint: undefined, onClick: () => onSeek(-5) };
  const forward = onNextLine
    ? { label: t('np.nextLine'), hint: t('np.nextLineHint'), onClick: onNextLine }
    : { label: '+5s', hint: undefined, onClick: () => onSeek(5) };
  const isMuted = volume === 0;
  const shownDuration = duration > 0 ? duration : fallbackDuration;
  const timeLeft = Math.max(0, shownDuration - currentTime);
  const playLabel = isPlaying || isLoading ? t('np.pause') : t('np.play');
  const fullscreenLabel = fullscreen ? t('np.npExitFullscreen') : t('np.npFullscreen');
  const volumeIcon = (cls: string) =>
    isMuted ? (
      <VolumeX className={cls} />
    ) : volume < 0.5 ? (
      <Volume1 className={cls} />
    ) : (
      <Volume2 className={cls} />
    );

  // ── Scrubber: pointer events, so it can be dragged; the knob follows the pointer ──
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const percentFrom = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };
  const shownPercent =
    dragPercent !== null
      ? dragPercent * 100
      : shownDuration > 0
        ? (currentTime / shownDuration) * 100
        : 0;
  const scrubberBar = (
    <div
      className="group -my-1.5 cursor-pointer touch-none py-2.5"
      onPointerDown={(e) => {
        if (!duration) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const pct = percentFrom(e.clientX);
        setDragPercent(pct);
        onSeekTo(pct * duration);
      }}
      onPointerMove={(e) => {
        if (dragPercent === null || !duration) return;
        setDragPercent(percentFrom(e.clientX));
      }}
      onPointerUp={(e) => {
        if (dragPercent === null) return;
        const pct = percentFrom(e.clientX);
        setDragPercent(null);
        if (duration) onSeekTo(pct * duration);
      }}
      onPointerCancel={() => setDragPercent(null)}
    >
      <div ref={barRef} dir="ltr" className="relative h-1.5 rounded-full bg-input">
        <div
          className={cn(
            'h-full rounded-full bg-primary-light',
            dragPercent === null && 'transition-[width] duration-100 ease-out',
          )}
          style={{ width: `${shownPercent}%` }}
        />
        <div
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow-md group-hover:scale-110',
            dragPercent === null ? 'transition-[left,transform] duration-100' : 'scale-125',
          )}
          style={{ left: `${shownPercent}%` }}
        />
      </div>
    </div>
  );

  const dialogs = (
    <>
      <Dialog open={volumeOpen} onOpenChange={setVolumeOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('np.volume')}</DialogTitle>
          </DialogHeader>
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onToggleMute}
                title={isMuted ? t('np.unmute') : t('np.mute')}
                aria-label={isMuted ? t('np.unmute') : t('np.mute')}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-card text-primary transition-colors hover:bg-muted"
              >
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <RangeSlider
                min={0}
                max={100}
                step={5}
                value={Math.round(volume * 100)}
                onChange={(v) => onVolumeChange(v / 100)}
                label={t('np.volume')}
                className="flex-1"
              />
              <span className="w-11 text-end text-sm font-semibold tabular-nums text-foreground">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[0, 0.25, 0.5, 0.75, 1].map((v) => {
                const on = Math.abs(volume - v) < 0.05;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onVolumeChange(v)}
                    className={cn(
                      'inline-flex h-10 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-card text-foreground hover:bg-muted',
                    )}
                  >
                    {v * 100}%
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={speedOpen} onOpenChange={setSpeedOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('np.speed')}</DialogTitle>
          </DialogHeader>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {SPEED_RATES.map((rate) => {
              const on = Math.abs(playbackRate - rate) < 0.01;
              return (
                <button
                  key={rate}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    onSpeedChange(rate);
                    setSpeedOpen(false);
                  }}
                  className={cn(
                    'inline-flex h-12 items-center justify-center rounded-md border text-[15px] font-semibold tabular-nums transition-colors',
                    on
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-input bg-card text-foreground hover:bg-muted',
                  )}
                >
                  {rate}x
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {onFontSizeChange && (
        <Dialog open={subtitleOpen} onOpenChange={setSubtitleOpen}>
          <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('np.subtitleSettings')}</DialogTitle>
            </DialogHeader>
            <div className="mt-3 flex flex-col gap-5">
              {onToggleSubtitles && (
                <div className="border-b border-border pb-4">
                  <PopoverToggle
                    label={t('np.npShowSubtitles')}
                    checked={subtitlesEnabled}
                    onChange={onToggleSubtitles}
                  />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{t('np.fontSize')}</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {Math.min(fontSize, 48)}px
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span aria-hidden className="text-xs font-semibold text-muted-foreground">
                    A
                  </span>
                  <RangeSlider
                    min={12}
                    max={48}
                    step={1}
                    value={Math.min(fontSize, 48)}
                    onChange={onFontSizeChange}
                    label={t('np.fontSize')}
                    className="flex-1"
                  />
                  <span
                    aria-hidden
                    className="text-lg font-semibold leading-none text-muted-foreground"
                  >
                    A
                  </span>
                </div>
              </div>
              {onContextLinesChange && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {t('np.npContextLines')}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CONTEXT_LINE_CHOICES.map((choice) => {
                      const on = contextLines === choice;
                      return (
                        <button
                          key={choice ?? 'auto'}
                          type="button"
                          aria-pressed={on}
                          onClick={() => onContextLinesChange(choice)}
                          className={cn(
                            'inline-flex h-9 min-w-[44px] items-center justify-center rounded-md border px-3 text-sm tabular-nums transition-colors',
                            on
                              ? 'border-primary-light/40 bg-primary-light/15 font-semibold text-primary'
                              : 'border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          {choice ?? t('np.npContextAuto')}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-caption">{t('np.npContextHint')}</p>
                </div>
              )}
              {(onToggleAutoPause || onTogglePauseOnWordHover) && (
                <div className="flex flex-col gap-3.5 border-t border-border pt-4">
                  {onToggleAutoPause && (
                    <PopoverToggle
                      label={t('np.autoPauseLabel')}
                      checked={autoPauseOnSubtitle}
                      onChange={onToggleAutoPause}
                    />
                  )}
                  {onTogglePauseOnWordHover && (
                    <PopoverToggle
                      label={t('np.pauseOnWordHover')}
                      checked={pauseOnWordHover}
                      onChange={onTogglePauseOnWordHover}
                    />
                  )}
                </div>
              )}
              {subtitleSourceSlot && (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  {subtitleSourceSlot}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );

  // The tools that act on the lines.
  const tools = [
    onVocab && (
      <DockTool
        key="vocab"
        icon={<Library className="h-5 w-5" />}
        label={t('np.vocabLabel')}
        onClick={onVocab}
      />
    ),
    onTranslateSentence && (
      <DockTool
        key="translate"
        icon={<Languages className="h-5 w-5" />}
        label={t('np.translateLabel')}
        hint={`${t('np.translateLabel')} (T)`}
        disabled={!hasCurrentSegment}
        onClick={onTranslateSentence}
      />
    ),
    onAnalyzeSentence && (
      <DockTool
        key="lena"
        icon={<MessageCircle className="h-5 w-5" />}
        label={t('np.askLena')}
        hint={`${t('np.askLena')} (A)`}
        disabled={!hasCurrentSegment}
        onClick={onAnalyzeSentence}
      />
    ),
    onSyncClick && (
      <DockTool
        key="sync"
        icon={<Timer className="h-5 w-5" />}
        label={t('np.syncLabel')}
        hint={`${t('np.syncLabel')} (S)`}
        onClick={onSyncClick}
      />
    ),
    onFontSizeChange && (
      <DockTool
        key="subtitle"
        icon={
          subtitlesEnabled ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />
        }
        label={t('np.subtitleLabel')}
        hint={`${t('np.subtitleSettings')} (C)`}
        active={subtitleOpen}
        onClick={() => setSubtitleOpen(true)}
      />
    ),
    onToggleFullscreen && (
      <DockTool
        key="fullscreen"
        icon={<Maximize className="h-5 w-5" />}
        label={fullscreenLabel}
        hint={`${fullscreenLabel} (F)`}
        onClick={onToggleFullscreen}
      />
    ),
    onPictureInPicture && (
      <DockTool
        key="pip"
        icon={<PictureInPicture2 className="h-5 w-5" />}
        label={t('np.npPip')}
        hint={`${pipActive ? t('np.npPipClose') : t('np.npPipHint')} (P)`}
        active={pipActive}
        onClick={onPictureInPicture}
      />
    ),
    onOpenProgram && (
      <DockTool
        key="program"
        icon={<Waypoints className="h-5 w-5" />}
        label={tl('launcher.label')}
        onClick={onOpenProgram}
      />
    ),
  ].filter((tool): tool is ReactElement => !!tool);

  if (layout === 'strip') {
    return (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-card px-6 py-2">
        <div className="order-1 flex items-center justify-center gap-1">
          <IconTool
            icon={<SkipBack className="h-5 w-5" />}
            label={back.hint ?? back.label}
            onClick={back.onClick}
          />
          <BigPlayButton
            size={44}
            isPlaying={isPlaying}
            isLoading={isLoading}
            label={playLabel}
            onClick={onPlayPause}
          />
          <IconTool
            icon={<SkipForward className="h-5 w-5" />}
            label={forward.hint ?? forward.label}
            onClick={forward.onClick}
          />
        </div>
        <div className="order-2 flex min-w-0 flex-1 basis-0 items-center gap-3 text-xs tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{formatTime(currentTime)}</span>
          <div className="min-w-0 flex-1">{scrubberBar}</div>
          <span>-{formatTime(timeLeft)}</span>
        </div>
        <div className="order-3 flex flex-wrap items-center justify-center gap-0.5">
          <button
            type="button"
            title={t('np.speed')}
            aria-label={t('np.speed')}
            onClick={() => setSpeedOpen(true)}
            className={cn(
              'inline-flex h-10 w-[52px] items-center justify-center rounded-md text-[13px] font-semibold tabular-nums transition-colors',
              speedOpen ? 'bg-primary-light/15 text-primary' : 'text-primary hover:bg-muted',
            )}
          >
            {playbackRate}x
          </button>
          <IconTool
            icon={volumeIcon('h-5 w-5')}
            label={t('np.volume')}
            active={volumeOpen}
            onClick={() => setVolumeOpen(true)}
          />
          {onVocab && (
            <IconTool
              icon={<Library className="h-5 w-5" />}
              label={t('np.vocabLabel')}
              onClick={onVocab}
            />
          )}
          {onTranslateSentence && (
            <IconTool
              icon={<Languages className="h-5 w-5" />}
              label={`${t('np.translateLabel')} (T)`}
              disabled={!hasCurrentSegment}
              onClick={onTranslateSentence}
            />
          )}
          {onSyncClick && (
            <IconTool
              icon={<Timer className="h-5 w-5" />}
              label={`${t('np.syncLabel')} (S)`}
              onClick={onSyncClick}
            />
          )}
          {onFontSizeChange && (
            <IconTool
              icon={
                subtitlesEnabled ? (
                  <Captions className="h-5 w-5" />
                ) : (
                  <CaptionsOff className="h-5 w-5" />
                )
              }
              label={`${t('np.subtitleSettings')} (C)`}
              active={subtitleOpen}
              onClick={() => setSubtitleOpen(true)}
            />
          )}
          {onPictureInPicture && (
            <IconTool
              icon={<PictureInPicture2 className="h-5 w-5" />}
              label={`${pipActive ? t('np.npPipClose') : t('np.npPipHint')} (P)`}
              active={pipActive}
              onClick={onPictureInPicture}
            />
          )}
          {onToggleFullscreen && (
            <IconTool
              icon={
                fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />
              }
              label={`${fullscreenLabel} (F)`}
              onClick={onToggleFullscreen}
            />
          )}
        </div>
        {dialogs}
      </div>
    );
  }

  // layout === 'card'
  const perRow = tools.length <= 4 ? tools.length : Math.ceil(tools.length / 2);
  return (
    <div className="flex flex-col gap-3">
      <div>
        {scrubberBar}
        {/* Time played and time LEFT, the way a podcast app reads. */}
        <div className="mt-1.5 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{formatTime(currentTime)}</span>
          <span>-{formatTime(timeLeft)}</span>
        </div>
      </div>
      <div className="flex w-full max-w-[480px] items-center justify-between gap-1 self-center">
        <TransportButton
          wide
          top={
            <span className="text-[17px] font-semibold leading-none tabular-nums">
              {playbackRate}x
            </span>
          }
          label={t('np.npSpeed')}
          hint={t('np.speed')}
          active={speedOpen}
          onClick={() => setSpeedOpen(true)}
        />
        <TransportButton
          icon={<SkipBack className="h-6 w-6" />}
          label={back.label}
          labelSizer={['-5s', t('np.prevLine')]}
          hint={back.hint}
          onClick={back.onClick}
        />
        <BigPlayButton
          size={64}
          isPlaying={isPlaying}
          isLoading={isLoading}
          label={playLabel}
          onClick={onPlayPause}
        />
        <TransportButton
          icon={<SkipForward className="h-6 w-6" />}
          label={forward.label}
          labelSizer={['+5s', t('np.nextLine')]}
          hint={forward.hint}
          onClick={forward.onClick}
        />
        <TransportButton
          icon={volumeIcon('h-6 w-6')}
          label={`${Math.round(volume * 100)}%`}
          hint={t('np.volume')}
          active={volumeOpen}
          onClick={() => setVolumeOpen(true)}
        />
      </div>
      {/* Never more than two rows, balanced: up to four in one row, then the longer half on top. */}
      {tools.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-y-2 border-t border-border pt-4">
          {tools.map((tool) => (
            <div key={tool.key} className={cn(TOOL_CELL[perRow], 'flex justify-center')}>
              {tool}
            </div>
          ))}
        </div>
      )}
      {dialogs}
    </div>
  );
}

function TransportButton({
  icon,
  top,
  label,
  labelSizer,
  hint,
  active,
  wide,
  onClick,
}: {
  icon?: ReactNode;
  top?: ReactNode;
  label: string;
  /** The widest label sets the width, so a change never shifts the row. */
  labelSizer?: string[];
  hint?: string;
  active?: boolean;
  wide?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={hint ?? label}
      aria-label={hint ?? label}
      onClick={onClick}
      className={cn(
        'inline-flex h-14 flex-col items-center justify-center gap-1 rounded-md px-1.5 transition-colors',
        wide ? 'w-[64px]' : 'min-w-[52px]',
        active ? 'bg-primary-light/15 text-primary' : 'text-primary hover:bg-muted',
      )}
    >
      <span className="flex h-6 items-center justify-center">{top ?? icon}</span>
      {labelSizer ? (
        <span className="grid justify-items-center text-[10.5px] font-medium leading-none text-muted-foreground">
          {labelSizer.map((l) => (
            <span key={l} aria-hidden className="invisible [grid-area:1/1]">
              {l}
            </span>
          ))}
          <span className="[grid-area:1/1]">{label}</span>
        </span>
      ) : (
        <span className="text-[10.5px] font-medium leading-none text-muted-foreground">
          {label}
        </span>
      )}
    </button>
  );
}

/** The one orange control on the screen. */
function BigPlayButton({
  size,
  isPlaying,
  isLoading,
  label,
  onClick,
}: {
  size: 44 | 64;
  isPlaying: boolean;
  isLoading: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} (Space)`}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-md transition-[background-color,transform] hover:bg-accent/90 active:scale-95',
        size === 64 ? 'h-16 w-16' : 'h-11 w-11',
      )}
    >
      {isLoading ? (
        <Loader2 className="h-7 w-7 animate-spin" />
      ) : isPlaying ? (
        <Pause className="h-7 w-7 fill-current" />
      ) : (
        <Play className="h-7 w-7 translate-x-0.5 fill-current" />
      )}
    </button>
  );
}

/** A tool in the row under the transport. */
function DockTool({
  icon,
  label,
  hint,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={hint ?? label}
      aria-label={hint ?? label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative inline-flex min-h-[48px] min-w-[52px] flex-col items-center justify-center gap-1 rounded-md px-1.5 py-1 transition-colors',
        disabled
          ? 'cursor-not-allowed text-caption opacity-50'
          : active
            ? 'bg-primary-light/15 text-primary'
            : 'text-primary hover:bg-muted',
      )}
    >
      {icon}
      <span className="text-[11px] font-medium leading-none text-muted-foreground">{label}</span>
    </button>
  );
}

/** An icon button in the full-screen strip; its label is the tooltip. */
function IconTool({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors',
        disabled
          ? 'cursor-not-allowed text-caption opacity-50'
          : active
            ? 'bg-primary-light/15 text-primary'
            : 'text-primary hover:bg-muted',
      )}
    >
      {icon}
    </button>
  );
}

/** A slider you can see: a rail, the filled part up to the value, a knob. */
function RangeSlider({
  min,
  max,
  step,
  value,
  onChange,
  label,
  className,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
}) {
  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  return (
    <div className={cn('relative flex h-6 items-center', className)}>
      <div aria-hidden className="absolute inset-x-0 h-1.5 rounded-full bg-input" />
      <div
        aria-hidden
        className="absolute start-0 h-1.5 rounded-full bg-primary-light"
        style={{ width: `calc(8px + (100% - 16px) * ${ratio})` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="relative m-0 h-6 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
      />
    </div>
  );
}

function PopoverToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent p-0"
      onClick={onChange}
    >
      <span className="text-start text-sm text-foreground">{label}</span>
      <span
        className={cn(
          'relative h-[18px] w-8 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary-light' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-xs transition-all',
            checked ? 'start-[14px]' : 'start-[2px]',
          )}
        />
      </span>
    </button>
  );
}
