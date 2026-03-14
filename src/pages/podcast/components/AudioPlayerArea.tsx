import { useState } from 'react';
import { Headphones } from 'lucide-react';
import { EpisodeInfoBadges } from './EpisodeInfoBadges';
import type { NlpAnalysis } from '../types';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface AudioPlayerAreaProps {
  title: string;
  showName?: string;
  image?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayClick: () => void;
  onSeek?: (seconds: number) => void;
  analysis?: NlpAnalysis | null;
}

export function AudioPlayerArea({
  title,
  showName,
  image,
  isPlaying,
  currentTime,
  duration,
  onPlayClick,
  onSeek,
  analysis,
}: AudioPlayerAreaProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleSkip = (seconds: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onSeek?.(seconds);
  };

  const progressDash = duration ? (currentTime / duration) * 283 : 0;

  return (
    <div className="relative w-full min-h-full flex items-start justify-center pt-3 sm:pt-6 md:pt-8 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-background via-card to-muted" />

      <div className="relative z-10 flex flex-col items-center gap-2 sm:gap-4 md:gap-6">
        {/* Artwork + progress ring */}
        <div
          className="relative w-32 h-32 min-[480px]:w-40 min-[480px]:h-40 sm:w-44 sm:h-44 lg:w-48 lg:h-48 flex items-center justify-center group"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <svg
            className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
            viewBox="0 0 100 100"
            aria-hidden
          >
            <circle cx="50" cy="50" r="45" fill="none" className="stroke-border" strokeWidth="4" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              className="stroke-accent transition-[stroke-dasharray] duration-300 ease-out"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${progressDash} 283`}
            />
          </svg>

          <div className="relative w-[112px] h-[112px] min-[480px]:w-[140px] min-[480px]:h-[140px] sm:w-[152px] sm:h-[152px] lg:w-[168px] lg:h-[168px] rounded-full overflow-hidden shadow-2xl ring-2 ring-border z-[1]">
            {image ? (
              <img src={image} alt={title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted text-4xl sm:text-[64px]">
                <Headphones className="w-10 h-10 sm:w-16 sm:h-16 text-muted-foreground" />
              </div>
            )}

            {/* Visualizer when playing */}
            {isPlaying && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 items-end h-12">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 bg-primary-light/70 rounded-sm animate-audio-visualize"
                    style={{
                      height: `${20 + (i % 3) * 10 + 5}px`,
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Controls overlay — shows on hover or paused */}
          <div
            className="absolute inset-0 z-20 hidden sm:flex items-center justify-center gap-2 lg:gap-3 rounded-full transition-opacity pointer-events-auto"
            style={{ opacity: isHovered || !isPlaying ? 1 : 0 }}
          >
            <button
              type="button"
              className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center cursor-pointer border border-primary shadow-md hover:bg-primary transition-colors"
              onClick={(e) => handleSkip(-5, e)}
              title="-5s"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                <text x="12" y="14" fontSize="6" fill="white" textAnchor="middle" fontWeight="bold">
                  5
                </text>
              </svg>
            </button>

            <button
              type="button"
              className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer border-2 border-primary shadow-lg hover:bg-primary/90 transition-colors"
              onClick={onPlayClick}
            >
              {isPlaying ? (
                <svg
                  className="w-5 h-5 sm:w-7 sm:h-7 lg:w-8 lg:h-8 opacity-90"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg
                  className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 opacity-90 ml-0.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center cursor-pointer border border-primary shadow-md hover:bg-primary transition-colors"
              onClick={(e) => handleSkip(5, e)}
              title="+5s"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
                <text x="12" y="14" fontSize="6" fill="white" textAnchor="middle" fontWeight="bold">
                  5
                </text>
              </svg>
            </button>
          </div>
        </div>

        {/* Podcast info + time */}
        <div className="text-center max-w-[90vw] sm:max-w-[400px] px-2">
          {showName && (
            <div className="text-[10px] sm:text-xs md:text-sm font-medium text-primary uppercase tracking-wider mb-0.5 md:mb-2">
              {showName}
            </div>
          )}
          <h1 className="text-base sm:text-xl md:text-2xl font-semibold text-foreground m-0 mb-1 md:mb-3 leading-tight line-clamp-2">
            {title || 'Podcast Episode'}
          </h1>
          <div className="text-xs sm:text-sm md:text-base text-muted-foreground font-mono">
            <span>{formatTime(currentTime)}</span>
            <span className="opacity-60"> / </span>
            <span>{formatTime(duration)}</span>
          </div>
          <EpisodeInfoBadges analysis={analysis} />
        </div>
      </div>
    </div>
  );
}
