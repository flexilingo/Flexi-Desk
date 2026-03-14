import { useState } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Gauge } from 'lucide-react';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export function PlayerControls() {
  const {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    togglePlayPause,
    seek,
    skipBack,
    skipForward,
    setPlaybackRate,
    setVolume,
  } = usePlayerStore();

  const [showVolume, setShowVolume] = useState(false);

  const handleSeek = (value: number[]) => {
    seek(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
  };

  const cycleSpeed = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    setPlaybackRate(SPEED_OPTIONS[nextIndex]);
  };

  const toggleMute = () => {
    setVolume(volume > 0 ? 0 : 1);
  };

  return (
    <div className="w-full space-y-2">
      {/* Seek bar */}
      <div className="flex items-center gap-3">
        <span className="min-w-[3.5rem] text-right text-xs text-muted-foreground tabular-nums">
          {formatTime(currentTime)}
        </span>
        <Slider
          value={[currentTime]}
          min={0}
          max={duration || 1}
          step={0.5}
          onValueChange={handleSeek}
          className="flex-1"
        />
        <span className="min-w-[3.5rem] text-xs text-muted-foreground tabular-nums">
          {formatTime(duration)}
        </span>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-center gap-1">
        {/* Playback speed */}
        <Button
          variant="ghost"
          size="sm"
          onClick={cycleSpeed}
          title="Playback speed"
          className="min-w-[3rem] tabular-nums text-xs"
        >
          <Gauge className="mr-1 h-3.5 w-3.5" />
          {playbackRate}x
        </Button>

        {/* Skip back 15s */}
        <Button variant="ghost" size="icon" onClick={() => skipBack(15)} title="Skip back 15s">
          <SkipBack className="h-4 w-4" />
        </Button>

        {/* Play / Pause */}
        <Button
          variant="default"
          size="icon"
          onClick={togglePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
          className="h-10 w-10 rounded-full"
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </Button>

        {/* Skip forward 15s */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => skipForward(15)}
          title="Skip forward 15s"
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        {/* Volume toggle + slider */}
        <div className="relative flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            onMouseEnter={() => setShowVolume(true)}
            title={volume > 0 ? 'Mute' : 'Unmute'}
          >
            {volume > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>

          {showVolume && (
            <div className="flex items-center gap-2 pl-1" onMouseLeave={() => setShowVolume(false)}>
              <Slider
                value={[volume]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={handleVolumeChange}
                className="w-20"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
