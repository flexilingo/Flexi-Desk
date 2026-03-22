import { useRef, useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  SkipBack,
  SkipForward,
  Gauge,
  Captions,
  CaptionsOff,
  NotebookPen,
  LogOut,
  Focus,
  SlidersHorizontal,
  Timer,
  AlignLeft,
  AlignCenter,
  AlignRight,
  MessageCircle,
  Languages,
  BookOpen,
  HelpCircle,
  Loader2,
} from 'lucide-react';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface ControlBarProps {
  isPlaying: boolean;
  isBuffering?: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onSeekTo: (time: number) => void;
  onToggleMute: () => void;
  onSpeedChange: (rate: number) => void;
  onVolumeChange: (volume: number) => void;
  focusMode?: boolean;
  subtitlesEnabled?: boolean;
  onToggleFocusMode?: () => void;
  onToggleSubtitles?: () => void;
  onNote?: () => void;
  onExit?: () => void;
  // Subtitle settings
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  subtitleBgOpacity?: number;
  onSubtitleBgOpacityChange?: (opacity: number) => void;
  // Cloud features
  hasCurrentSegment?: boolean;
  onAnalyzeSentence?: () => void;
  onTranslateSentence?: () => void;
  onGrammarSentence?: () => void;
  onHelp?: () => void;
  // Sync
  onSyncClick?: () => void;
  // Auto-pause / hover pause / alignment
  autoPauseOnSubtitle?: boolean;
  onToggleAutoPause?: () => void;
  pauseOnWordHover?: boolean;
  onTogglePauseOnHover?: () => void;
  translationAlignment?: 'left' | 'center' | 'right';
  onTranslationAlignmentChange?: (alignment: 'left' | 'center' | 'right') => void;
  // Show estimated CEFR
  showEstimatedOnSubtitles?: boolean;
  onToggleShowEstimated?: () => void;
}

const SPEED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function ControlBar({
  isPlaying,
  isBuffering = false,
  currentTime,
  duration,
  volume,
  isMuted,
  playbackRate,
  onPlayPause,
  onSeek,
  onSeekTo,
  onToggleMute,
  onSpeedChange,
  onVolumeChange,
  focusMode = false,
  subtitlesEnabled = true,
  onToggleFocusMode,
  onToggleSubtitles,
  onNote,
  onExit,
  hasCurrentSegment,
  onAnalyzeSentence,
  onTranslateSentence,
  onGrammarSentence,
  onHelp,
  fontSize,
  onFontSizeChange,
  subtitleBgOpacity,
  onSubtitleBgOpacityChange,
  onSyncClick,
  autoPauseOnSubtitle,
  onToggleAutoPause,
  pauseOnWordHover,
  onTogglePauseOnHover,
  translationAlignment,
  onTranslationAlignmentChange,
  showEstimatedOnSubtitles,
  onToggleShowEstimated,
}: ControlBarProps) {
  const { t } = useTranslation();
  const [showSpeedPopover, setShowSpeedPopover] = useState(false);
  const [showVolumePopover, setShowVolumePopover] = useState(false);
  const [showSubtitlePopover, setShowSubtitlePopover] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const displayVolume = isMuted ? 0 : volume;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(e.target as Node))
        setShowSpeedPopover(false);
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node))
        setShowVolumePopover(false);
      if (subtitleRef.current && !subtitleRef.current.contains(e.target as Node))
        setShowSubtitlePopover(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeekTo(percent * duration);
  };

  const hasCenter = !!(
    onToggleSubtitles ||
    onNote ||
    onAnalyzeSentence ||
    onTranslateSentence ||
    onGrammarSentence
  );
  const hasRight = !!(onSyncClick || onFontSizeChange || onToggleFocusMode || onHelp || onExit);

  return (
    <div className="flex flex-col shrink-0 py-1.5 px-2 md:py-2 md:px-4 border-t border-border bg-card">
      {/* Progress bar + time */}
      <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
        <div
          className="flex-1 h-1.5 bg-border rounded-sm cursor-pointer relative min-w-0"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-primary rounded-sm transition-[width] duration-100 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="absolute top-1/2 w-3 h-3 bg-primary rounded-full -translate-x-1/2 -translate-y-1/2 shadow-md transition-[left] duration-100 border-2 border-background"
            style={{ left: `${progressPercent}%` }}
          />
        </div>
        <div className="flex gap-1 text-[10px] md:text-xs font-mono text-muted-foreground whitespace-nowrap flex-shrink-0">
          <span>{formatTime(currentTime)}</span>
          <span className="opacity-50">/</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls row — 3 groups: LEFT | CENTER | RIGHT */}
      <div className="flex items-center justify-between gap-1 md:gap-2 flex-wrap min-h-[40px]">
        {/* LEFT: Playback controls */}
        <div className="flex items-center gap-0.5 md:gap-1">
          <ControlButton
            icon={<SkipBack className="w-full h-full" />}
            label="-5s"
            onClick={() => onSeek(-5)}
          />
          <ControlButton
            icon={
              isBuffering
                ? <Loader2 className="w-full h-full animate-spin" />
                : isPlaying
                  ? <Pause className="w-full h-full" />
                  : <Play className="w-full h-full" />
            }
            label={isBuffering ? 'Loading…' : isPlaying ? t('podcast.pause') : t('podcast.play')}
            onClick={onPlayPause}
            primary
          />
          <ControlButton
            icon={<SkipForward className="w-full h-full" />}
            label="+5s"
            onClick={() => onSeek(5)}
          />

          {/* Volume */}
          <div className="relative" ref={volumeRef}>
            <ControlButton
              icon={
                isMuted || displayVolume === 0 ? (
                  <VolumeX className="w-full h-full" />
                ) : displayVolume < 0.5 ? (
                  <Volume1 className="w-full h-full" />
                ) : (
                  <Volume2 className="w-full h-full" />
                )
              }
              label={`${Math.round(displayVolume * 100)}%`}
              onClick={() => setShowVolumePopover((v) => !v)}
              active={showVolumePopover}
            />
            {showVolumePopover && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 p-3 rounded-xl bg-popover border border-border shadow-xl flex flex-col items-center gap-2 min-w-[80px] z-[1000]">
                <button
                  type="button"
                  className="w-full py-1.5 px-3 rounded-md bg-muted text-foreground text-xs border border-border cursor-pointer hover:bg-muted/80"
                  onClick={onToggleMute}
                >
                  {isMuted ? t('podcast.unmute') : t('podcast.mute')}
                </button>
                <div
                  className="w-2 h-24 bg-muted rounded cursor-pointer relative"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = 1 - (e.clientY - rect.top) / rect.height;
                    onVolumeChange(Math.max(0, Math.min(1, percent)));
                  }}
                >
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-primary rounded transition-[height] duration-100"
                    style={{ height: `${displayVolume * 100}%` }}
                  />
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {Math.round(displayVolume * 100)}%
                </div>
                <div className="flex flex-col gap-1 w-full">
                  {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`py-1 px-2 rounded text-xs border cursor-pointer transition-colors ${
                        Math.abs(volume - v) < 0.05
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-transparent text-muted-foreground hover:bg-muted border-border'
                      }`}
                      onClick={() => onVolumeChange(v)}
                    >
                      {v * 100}%
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Speed */}
          <div className="relative" ref={speedRef}>
            <ControlButton
              icon={<Gauge className="w-full h-full" />}
              label={`${playbackRate}x`}
              onClick={() => setShowSpeedPopover((v) => !v)}
              active={showSpeedPopover}
            />
            {showSpeedPopover && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 p-2 rounded-xl bg-popover border border-border shadow-xl flex flex-col gap-1 min-w-[80px] z-[1000]">
                {SPEED_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`py-1.5 px-3 rounded-md text-xs border cursor-pointer transition-colors text-center ${
                      Math.abs(playbackRate - rate) < 0.01
                        ? 'bg-primary text-primary-foreground border-primary font-semibold'
                        : 'bg-transparent text-foreground hover:bg-muted border-border'
                    }`}
                    onClick={() => {
                      onSpeedChange(rate);
                      setShowSpeedPopover(false);
                    }}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Separator */}
        {hasCenter && <div className="w-px h-8 bg-border/50 hidden md:block" />}

        {/* CENTER: Features (CC, Note, Ask Lena, Translate, Grammar) */}
        {hasCenter && (
          <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
            {onToggleSubtitles && (
              <ControlButton
                icon={
                  subtitlesEnabled ? (
                    <Captions className="w-full h-full" />
                  ) : (
                    <CaptionsOff className="w-full h-full" />
                  )
                }
                label={t('podcast.ccLabel')}
                primary={subtitlesEnabled}
                onClick={onToggleSubtitles}
              />
            )}
            {onNote && (
              <ControlButton
                icon={<NotebookPen className="w-full h-full" />}
                label={t('podcast.noteLabel')}
                onClick={onNote}
              />
            )}
            {onAnalyzeSentence && (
              <ControlButton
                icon={<MessageCircle className="w-full h-full" />}
                label={t('podcast.askLena')}
                onClick={onAnalyzeSentence}
                disabled={!hasCurrentSegment}
              />
            )}
            {onTranslateSentence && (
              <ControlButton
                icon={<Languages className="w-full h-full" />}
                label={t('podcast.translateLabel')}
                onClick={onTranslateSentence}
                disabled={!hasCurrentSegment}
              />
            )}
            {onGrammarSentence && (
              <ControlButton
                icon={<BookOpen className="w-full h-full" />}
                label={t('podcast.grammarLabel')}
                onClick={onGrammarSentence}
                disabled={!hasCurrentSegment}
              />
            )}
          </div>
        )}

        {/* Separator */}
        {hasRight && <div className="w-px h-8 bg-border/50 hidden md:block" />}

        {/* RIGHT: Sync, Subtitle Settings, Focus, Help, Exit */}
        {hasRight && (
          <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
            {onSyncClick && (
              <ControlButton
                icon={<Timer className="w-full h-full" />}
                label={t('podcast.syncLabel')}
                onClick={onSyncClick}
              />
            )}

            {/* Subtitle settings popover */}
            {onFontSizeChange && (
              <div className="relative" ref={subtitleRef}>
                <ControlButton
                  icon={<SlidersHorizontal className="w-full h-full" />}
                  label={t('podcast.subtitleLabel')}
                  onClick={() => setShowSubtitlePopover((v) => !v)}
                  active={showSubtitlePopover}
                />
                {showSubtitlePopover && (
                  <SubtitleSettingsPopover
                    fontSize={fontSize ?? 24}
                    onFontSizeChange={onFontSizeChange}
                    bgOpacity={subtitleBgOpacity ?? 75}
                    onBgOpacityChange={onSubtitleBgOpacityChange}
                    autoPause={autoPauseOnSubtitle}
                    onToggleAutoPause={onToggleAutoPause}
                    pauseOnWordHover={pauseOnWordHover}
                    onTogglePauseOnHover={onTogglePauseOnHover}
                    alignment={translationAlignment}
                    onAlignmentChange={onTranslationAlignmentChange}
                    showEstimatedOnSubtitles={showEstimatedOnSubtitles}
                    onToggleShowEstimated={onToggleShowEstimated}
                  />
                )}
              </div>
            )}

            {onToggleFocusMode && (
              <ControlButton
                icon={<Focus className="w-full h-full" />}
                label={t('podcast.focusLabel')}
                primary={focusMode}
                onClick={onToggleFocusMode}
              />
            )}

            {onHelp && (
              <ControlButton
                icon={<HelpCircle className="w-full h-full" />}
                label={t('podcast.helpLabel')}
                onClick={onHelp}
              />
            )}

            {onExit && (
              <ControlButton
                icon={<LogOut className="w-full h-full" />}
                label={t('podcast.exitLabel')}
                danger
                onClick={onExit}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ControlButton ────────────────────────────────────

function ControlButton({
  icon,
  label,
  shortcut,
  primary,
  danger,
  disabled,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center justify-center py-1.5 px-2 md:py-2 md:px-3 rounded-lg border cursor-pointer gap-0.5 transition-colors ${
        primary ? 'min-w-[52px] md:min-w-[60px]' : 'min-w-[40px] md:min-w-[50px]'
      } ${
        disabled
          ? 'opacity-50 cursor-not-allowed bg-muted/50 text-muted-foreground border-border'
          : danger
            ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/30'
            : active || primary
              ? 'bg-primary/20 text-primary hover:bg-primary/30 border-primary/40'
              : 'bg-muted text-foreground hover:bg-muted/80 border-border'
      }`}
    >
      <span className="flex items-center justify-center w-4 h-4 md:w-[18px] md:h-[18px]">
        {icon}
      </span>
      <span className="text-[7px] md:text-[8px] opacity-70 leading-none">{label}</span>
    </button>
  );
}

// ── PopoverToggle ────────────────────────────────────

function PopoverToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center justify-between gap-3 cursor-pointer bg-transparent border-none p-0 w-full"
      onClick={() => onChange(!checked)}
    >
      <span className="text-xs text-foreground">{label}</span>
      <div
        className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <div
          className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-all"
          style={{ left: checked ? '14px' : '2px' }}
        />
      </div>
    </button>
  );
}

// ── SubtitleSettingsPopover ───────────────────────────

function SubtitleSettingsPopover({
  fontSize,
  onFontSizeChange,
  bgOpacity,
  onBgOpacityChange,
  autoPause,
  onToggleAutoPause,
  pauseOnWordHover,
  onTogglePauseOnHover,
  alignment,
  onAlignmentChange,
  showEstimatedOnSubtitles,
  onToggleShowEstimated,
}: {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  bgOpacity: number;
  onBgOpacityChange?: (opacity: number) => void;
  autoPause?: boolean;
  onToggleAutoPause?: () => void;
  pauseOnWordHover?: boolean;
  onTogglePauseOnHover?: () => void;
  alignment?: 'left' | 'center' | 'right';
  onAlignmentChange?: (alignment: 'left' | 'center' | 'right') => void;
  showEstimatedOnSubtitles?: boolean;
  onToggleShowEstimated?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="absolute bottom-full right-0 mb-3 p-4 rounded-xl bg-popover border border-border shadow-xl flex flex-col gap-4 min-w-[240px] z-[1000]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          {t('podcast.subtitleSettings')}
        </span>
      </div>

      {/* Font size */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('podcast.fontSize')}</span>
          <span className="text-xs font-medium text-foreground">{fontSize}px</span>
        </div>
        <input
          type="range"
          min={12}
          max={50}
          step={1}
          value={fontSize}
          onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary"
        />
      </div>

      {/* Background opacity */}
      {onBgOpacityChange && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t('podcast.backgroundOpacity')}</span>
            <span className="text-xs font-medium text-foreground">{bgOpacity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={bgOpacity}
            onChange={(e) => onBgOpacityChange(parseInt(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary"
          />
        </div>
      )}

      {/* Text Alignment */}
      {onAlignmentChange && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t('podcast.translationAlignment')}</span>
          <div className="flex gap-1">
            {(
              [
                ['left', AlignLeft],
                ['center', AlignCenter],
                ['right', AlignRight],
              ] as const
            ).map(([value, Icon]) => (
              <button
                key={value}
                type="button"
                className={`flex-1 py-1.5 rounded-md border cursor-pointer transition-colors flex items-center justify-center ${
                  alignment === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground hover:bg-muted border-border'
                }`}
                onClick={() => onAlignmentChange(value)}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Auto-pause on subtitle boundary */}
      {onToggleAutoPause && (
        <PopoverToggle
          label={t('podcast.autoPauseLabel')}
          checked={!!autoPause}
          onChange={() => onToggleAutoPause()}
        />
      )}

      {/* Pause on word hover */}
      {onTogglePauseOnHover && (
        <PopoverToggle
          label={t('podcast.pauseOnWordHover')}
          checked={!!pauseOnWordHover}
          onChange={() => onTogglePauseOnHover()}
        />
      )}

      {/* Show estimated CEFR */}
      {onToggleShowEstimated && (
        <PopoverToggle
          label={t('podcast.showEstimatedCefr', 'Show estimated CEFR')}
          checked={!!showEstimatedOnSubtitles}
          onChange={() => onToggleShowEstimated()}
        />
      )}
    </div>
  );
}
