import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pause, Play, RotateCcw } from 'lucide-react';

/** 1× first; slower is what a learner replaying a missed item reaches for. */
const SPEEDS = [1, 0.75, 1.25] as const;
const BACK_SEC = 5;

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** One clip at a time: starting a review clip pauses any other on the page. */
function pauseOtherReviewAudio(self: HTMLAudioElement) {
  document.querySelectorAll<HTMLAudioElement>('audio[data-review-audio]').forEach((a) => {
    if (a !== self && !a.paused) a.pause();
  });
}

interface ReviewAudioPlayerProps {
  src: string;
  /** What is playing, for screen readers ("Listen again", "Your recording"). */
  label: string;
  /** 'none' for remote files (nothing loads until played); 'metadata' for a local blob. */
  preload?: 'none' | 'metadata';
  onError?: () => void;
}

/**
 * The results page's compact audio player, drawn in the podcast player's
 * language (round terra play button, cream back button, terra progress on a
 * soft track) instead of the browser's own control. Back 5 s and a speed chip
 * because replaying a missed item slowly is the point of listening again.
 * The timeline always runs left to right, also on RTL pages.
 */
export function ReviewAudioPlayer({
  src,
  label,
  preload = 'none',
  onError,
}: ReviewAudioPlayerProps) {
  const { t } = useTranslation('exam');
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const speed = SPEEDS[speedIdx];
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      setWaiting(true);
      el.play().catch(() => setWaiting(false));
    } else {
      el.pause();
    }
  };

  const back = () => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, el.currentTime - BACK_SEC);
    setCurrent(el.currentTime);
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    const el = audioRef.current;
    if (el) {
      el.defaultPlaybackRate = SPEEDS[next];
      el.playbackRate = SPEEDS[next];
    }
  };

  const seekTo = (clientX: number) => {
    const el = audioRef.current;
    const bar = barRef.current;
    if (!el || !bar || !duration) return;
    const r = bar.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    el.currentTime = p * duration;
    setCurrent(el.currentTime);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekTo(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) seekTo(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const step = e.key === 'ArrowRight' ? BACK_SEC : e.key === 'ArrowLeft' ? -BACK_SEC : 0;
    if (!step) return;
    e.preventDefault();
    el.currentTime = Math.min(duration, Math.max(0, el.currentTime + step));
    setCurrent(el.currentTime);
  };

  const readDuration = (el: HTMLAudioElement) =>
    setDuration(Number.isFinite(el.duration) ? el.duration : 0);

  return (
    <div
      dir="ltr"
      className="inline-flex items-center gap-2.5 w-full max-w-lg rounded-[9px] border border-border bg-muted px-2.5 py-2"
    >
      <audio
        ref={audioRef}
        src={src}
        preload={preload}
        data-review-audio=""
        aria-label={label}
        onPlay={(e) => {
          pauseOtherReviewAudio(e.currentTarget);
          setPlaying(true);
        }}
        onPlaying={() => setWaiting(false)}
        onWaiting={() => setWaiting(true)}
        onPause={() => {
          setPlaying(false);
          setWaiting(false);
        }}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          if (!dragging.current) setCurrent(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = speed;
          readDuration(e.currentTarget);
        }}
        onDurationChange={(e) => readDuration(e.currentTarget)}
        onError={() => {
          setPlaying(false);
          setWaiting(false);
          onError?.();
        }}
      />

      <button
        type="button"
        onClick={back}
        aria-label={t('results.audioBack5')}
        title={t('results.audioBack5')}
        className="relative inline-flex w-8 h-8 shrink-0 items-center justify-center rounded-full bg-card border border-border text-primary hover:bg-muted transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span className="absolute -bottom-0.5 -right-0.5 text-[8.5px] font-bold leading-none text-primary bg-card rounded-full px-[3px] py-[1px] border border-border tabular-nums">
          {BACK_SEC}
        </span>
      </button>

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('pauseAudio') : label}
        className="inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-sm hover:bg-accent transition-colors"
      >
        {waiting && playing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : playing ? (
          <Pause className="w-4 h-4" fill="currentColor" />
        ) : waiting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4 ms-0.5" fill="currentColor" />
        )}
      </button>

      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label={t('audioSeekLabel')}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(current)}
        aria-valuetext={`${fmt(current)} / ${duration ? fmt(duration) : '--:--'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={`group relative flex-1 min-w-0 h-5 flex items-center touch-none outline-none ${duration ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="h-1.5 w-full rounded-full bg-primary overflow-hidden">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        {duration > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-accent border-2 border-border shadow-sm opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>

      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        <span className="font-semibold text-foreground">{fmt(current)}</span>
        <span className="text-muted-foreground/50"> / </span>
        {duration ? fmt(duration) : '--:--'}
      </span>

      <button
        type="button"
        onClick={cycleSpeed}
        aria-label={`${t('results.audioSpeed')}: ${speed}×`}
        title={t('results.audioSpeed')}
        className={`inline-flex shrink-0 items-center justify-center min-w-[38px] h-7 px-1.5 rounded-full border text-[11px] font-semibold tabular-nums transition-colors ${
          speed === 1
            ? 'border-border bg-card text-muted-foreground hover:bg-muted'
            : 'border-accent/40 bg-accent/10 text-accent'
        }`}
      >
        {speed}×
      </button>
    </div>
  );
}
