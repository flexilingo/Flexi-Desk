import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, Play, Pause } from 'lucide-react';

type AudioState = 'waiting' | 'countdown' | 'playing' | 'complete';

interface AudioPlayerProps {
  src: string;
  onComplete: () => void;
  autoPlay?: boolean;
  /** DEV ONLY — when set, stops playback and jumps straight to complete. */
  forceComplete?: boolean;
  /** Learning mode — real exams play once with no controls; this shows a full
   *  player (play/pause + seek) so the user can scrub freely. */
  fullControls?: boolean;
}

export function AudioPlayer({
  src,
  onComplete,
  autoPlay = true,
  forceComplete = false,
  fullControls = false,
}: AudioPlayerProps) {
  const { t } = useTranslation('celpip');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<AudioState>('waiting');
  const [countdown, setCountdown] = useState(3);
  // Full-controls (learning) player state
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // onComplete must fire exactly once even if `ended` and dev-skip race.
  const completedOnceRef = useRef(false);

  useEffect(() => {
    // No audio available — complete immediately so the questions show.
    if (!src) {
      setState('complete');
      if (!completedOnceRef.current) {
        completedOnceRef.current = true;
        onComplete();
      }
      return;
    }
    // Real-exam behaviour: audio starts on its own after a short countdown —
    // there is no manual play step. The Play button ("waiting") is only reached
    // as a fallback when the browser blocks autoplay.
    if (autoPlay) {
      setCountdown(3);
      setState('countdown');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Countdown → play
  useEffect(() => {
    if (state !== 'countdown') return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          setState('playing');
          audioRef.current?.play().catch(() => {
            // Autoplay still blocked — fall back to the manual Play button.
            setState('waiting');
          });
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  // DEV ONLY — force-complete: pause whatever is playing and unlock the questions.
  useEffect(() => {
    if (!forceComplete || state === 'complete') return;
    audioRef.current?.pause();
    setState('complete');
    if (!completedOnceRef.current) {
      completedOnceRef.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceComplete]);

  const handleStart = () => {
    if (!src) return;
    setCountdown(3);
    setState('countdown');
  };

  const handleEnded = () => {
    setState('complete');
    setIsPaused(true);
    if (!completedOnceRef.current) {
      completedOnceRef.current = true;
      onComplete();
    }
  };

  const fmt = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      // Restart from the top if we're at the end.
      if (el.ended || (el.duration && el.currentTime >= el.duration - 0.05)) {
        el.currentTime = 0;
      }
      setState('playing');
      setIsPaused(false);
      el.play().catch(() => setIsPaused(true));
    } else {
      el.pause();
      setIsPaused(true);
    }
  };

  const handleSeek = (value: number) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    el.currentTime = value;
    setCurrentTime(value);
  };

  return (
    <div className="bg-muted rounded-lg p-4 flex items-center gap-3 mb-4">
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onEnded={handleEnded}
          onTimeUpdate={(e) => fullControls && setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => fullControls && setDuration(e.currentTarget.duration || 0)}
          onPause={() => fullControls && setIsPaused(true)}
          onPlay={() => fullControls && setIsPaused(false)}
          preload="auto"
        />
      )}

      {/* Learning mode: full player — pause and scrub freely */}
      {fullControls && src && state !== 'waiting' && state !== 'countdown' && (
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={togglePlay}
            aria-label={isPaused ? t('listeningStartAudio') : t('pauseAudio')}
            className="w-9 h-9 rounded-full bg-accent text-white inline-flex items-center justify-center hover:bg-accent/90 transition-colors shrink-0"
          >
            {isPaused ? <Play className="w-4 h-4 ms-0.5" /> : <Pause className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => handleSeek(Number(e.target.value))}
            aria-label={t('audioSeekLabel')}
            className="flex-1 min-w-0 h-1.5 accent-accent cursor-pointer"
          />
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums shrink-0">
            {fmt(currentTime)} / {fmt(duration)}
          </span>
        </div>
      )}

      {state === 'waiting' && src && (
        <>
          <button
            onClick={handleStart}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            <Play className="w-4 h-4" />
            {t('listeningStartAudio')}
          </button>
          <span className="text-xs text-muted-foreground">{t('listeningAudioOnce')}</span>
        </>
      )}

      {state === 'countdown' && (
        <>
          <Volume2 className="w-5 h-5 text-accent animate-pulse" />
          <span className="text-sm text-muted-foreground">
            {t('listeningAudioWaiting', { seconds: countdown })}
          </span>
        </>
      )}

      {state === 'playing' && !fullControls && (
        <>
          <Volume2 className="w-5 h-5 text-accent animate-pulse" />
          <span className="text-sm text-accent font-medium">{t('listeningAudioPlaying')}</span>
        </>
      )}

      {state === 'complete' && !fullControls && (
        <>
          <Volume2 className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t('listeningAudioComplete')}</span>
        </>
      )}
    </div>
  );
}
