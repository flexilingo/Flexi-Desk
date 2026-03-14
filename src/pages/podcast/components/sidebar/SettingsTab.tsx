import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';

interface SettingsTabProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  subtitleBgOpacity: number;
  onSubtitleBgOpacityChange: (opacity: number) => void;
  subtitlesEnabled: boolean;
  onToggleSubtitles: () => void;
  autoPauseOnBoundary?: boolean;
  onToggleAutoPause?: () => void;
  pauseOnHover?: boolean;
  onTogglePauseOnHover?: () => void;
  subtitleAlignment?: 'left' | 'center' | 'right';
  onSubtitleAlignmentChange?: (alignment: 'left' | 'center' | 'right') => void;
}

function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        enabled ? 'bg-[#8BB7A3]' : 'bg-muted'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function SettingsTab({
  fontSize,
  onFontSizeChange,
  subtitleBgOpacity,
  onSubtitleBgOpacityChange,
  subtitlesEnabled,
  onToggleSubtitles,
  autoPauseOnBoundary = false,
  onToggleAutoPause,
  pauseOnHover = false,
  onTogglePauseOnHover,
  subtitleAlignment = 'center',
  onSubtitleAlignmentChange,
}: SettingsTabProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Player Settings</h3>

      {/* Subtitles toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Show Subtitles</span>
        <ToggleSwitch enabled={subtitlesEnabled} onToggle={onToggleSubtitles} />
      </div>

      <Separator />

      {/* Font size */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Font Size</span>
          <span className="text-xs text-muted-foreground tabular-nums">{fontSize}px</span>
        </div>
        <Slider
          value={[fontSize]}
          onValueChange={([v]) => onFontSizeChange(v)}
          min={14}
          max={40}
          step={1}
          className="w-full"
        />
      </div>

      {/* Subtitle background opacity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Background Opacity</span>
          <span className="text-xs text-muted-foreground tabular-nums">{subtitleBgOpacity}%</span>
        </div>
        <Slider
          value={[subtitleBgOpacity]}
          onValueChange={([v]) => onSubtitleBgOpacityChange(v)}
          min={0}
          max={100}
          step={5}
          className="w-full"
        />
      </div>

      {/* Text Alignment */}
      {onSubtitleAlignmentChange && (
        <>
          <Separator />
          <div className="space-y-2">
            <span className="text-xs font-medium">Text Alignment</span>
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
                  className={`flex-1 py-1.5 rounded-md border transition-colors flex items-center justify-center ${
                    subtitleAlignment === value
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'bg-transparent text-muted-foreground hover:bg-muted border-border'
                  }`}
                  onClick={() => onSubtitleAlignmentChange(value)}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Behavior toggles */}
      {(onToggleAutoPause || onTogglePauseOnHover) && (
        <>
          <Separator />
          <h3 className="text-sm font-semibold">Behavior</h3>

          {onToggleAutoPause && (
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <span className="text-xs font-medium">Auto-pause on boundary</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Pause when each subtitle segment ends
                </p>
              </div>
              <ToggleSwitch enabled={autoPauseOnBoundary} onToggle={onToggleAutoPause} />
            </div>
          )}

          {onTogglePauseOnHover && (
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <span className="text-xs font-medium">Pause on word hover</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Pause when hovering over subtitle words
                </p>
              </div>
              <ToggleSwitch enabled={pauseOnHover} onToggle={onTogglePauseOnHover} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
