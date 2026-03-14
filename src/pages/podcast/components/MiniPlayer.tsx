import { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Maximize2, Pause, Play, X, Volume2, VolumeX, Volume1 } from 'lucide-react';
import { usePlayerStore } from '../stores/playerStore';
import { usePodcastStore } from '../stores/podcastStore';

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function MiniPlayer() {
  const currentEpisode = usePlayerStore((s) => s.currentEpisode);
  const currentFeed = usePlayerStore((s) => s.currentFeed);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const seek = usePlayerStore((s) => s.seek);
  const stop = usePlayerStore((s) => s.stop);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const openPlayer = usePodcastStore((s) => s.openPlayer);
  const navigate = useNavigate();
  const location = useLocation();

  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!currentEpisode) return null;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(Math.max(0, Math.min(1, ratio)) * duration);
  };

  const handleExpand = () => {
    if (currentEpisode) {
      openPlayer(currentEpisode, currentFeed ?? undefined);
      // Navigate to podcast page if not already there
      if (!location.pathname.includes('/podcast')) {
        navigate('/podcast');
      }
    }
  };

  const isMuted = volume === 0;

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate leading-tight">
            {currentEpisode.title || 'Loading...'}
          </p>
          {currentFeed && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{currentFeed.title}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleExpand}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title="Expand Player"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={stop}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title="Close Player"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div
        ref={progressRef}
        className="mx-3 h-1 bg-muted rounded-full cursor-pointer group"
        onClick={handleProgressClick}
      >
        <div
          className="h-full bg-primary rounded-full transition-all duration-150 group-hover:bg-primary/80"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 px-3 pt-2 pb-3">
        {/* Artwork */}
        <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0">
          {currentFeed?.artworkUrl ? (
            <img
              src={currentFeed.artworkUrl}
              alt={currentEpisode.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg">🎙</div>
          )}
        </div>

        {/* Time */}
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {formatTime(currentTime)}
          <span className="opacity-50"> / {formatTime(duration)}</span>
        </span>

        <div className="flex-1" />

        {/* Volume */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowVolumeSlider((v) => !v)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Volume"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : volume < 0.5 ? (
              <Volume1 className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          {showVolumeSlider && (
            <div className="absolute bottom-full right-0 mb-2 p-3 rounded-xl bg-popover border border-border shadow-xl flex flex-col items-center gap-2 min-w-[72px] z-[1000]">
              <div
                className="w-2 h-20 bg-muted rounded cursor-pointer relative"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = 1 - (e.clientY - rect.top) / rect.height;
                  setVolume(Math.max(0, Math.min(1, percent)));
                }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 bg-primary rounded transition-[height] duration-100"
                  style={{ height: `${volume * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-foreground tabular-nums">
                {Math.round(volume * 100)}%
              </span>
              <button
                type="button"
                className="w-full py-1 px-1.5 rounded text-[10px] border border-border bg-muted text-foreground cursor-pointer hover:bg-muted/80"
                onClick={() => setVolume(isMuted ? 1 : 0)}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
            </div>
          )}
        </div>

        {/* Play/Pause */}
        <button
          type="button"
          onClick={togglePlayPause}
          className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shrink-0"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>
      </div>
    </div>
  );
}
