import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { iconBtn, playBtn } from './book-controls';

/** The same step as the recordings' bar and its arrow keys. */
const SKIP_SECONDS = 5;
/** Slower only: the point is to catch what was said, not to get through it. */
const SPEEDS = [1, 0.75, 0.5] as const;
const VOLUME_STEP = 0.05;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A book video with controls of our own, and a large view in the middle of the
 * screen.
 *
 * The browser's own controls sat ON the picture — over the publisher's
 * burned-in subtitles — and their full screen took the page away, which is the
 * whole reason to watch here. So the controls sit under the picture, and
 * "enlarge" opens a dialog over the page instead.
 *
 * ONE `<video>` for both views. It lives in a node of its own (`host`) that is
 * moved between the panel and the dialog, so enlarging does not reload the file
 * or lose a single second: a media element moved within the same task keeps
 * playing. Two elements synced by time would re-buffer and stutter on every
 * switch.
 */
export function BookVideoPlayer({
  src,
  title,
  videoRef,
  autoPlay,
  resumeAt,
  onPlayingChange,
  onError,
  headerExtra,
}: {
  src: string;
  /** The book's own title, shown in the enlarged view. */
  title: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  autoPlay: boolean;
  /** Where to pick up after the file was swapped (the subtitle switch). */
  resumeAt: number | null;
  onPlayingChange: (playing: boolean) => void;
  onError: () => void;
  /** Shown in the enlarged view's header — the subtitle switch. */
  headerExtra?: ReactNode;
}) {
  const { t } = useTranslation('reader');

  // Made on the client only — there is no document on the server. The panel
  // only opens on a click, so it is never part of a server render anyway.
  const [host] = useState<HTMLDivElement | null>(() => {
    if (typeof document === 'undefined') return null;
    const node = document.createElement('div');
    node.className = 'w-full';
    return node;
  });
  const inlineSlot = useRef<HTMLDivElement>(null);
  const dialogSlot = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState<number>(1);
  /** Where the seek bar is being dragged to; the file is only asked for that second on release. */
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => () => host?.remove(), [host]);

  // Put the player where it is being shown. Runs after the dialog's slot exists.
  useLayoutEffect(() => {
    const slot = (expanded ? dialogSlot : inlineSlot).current;
    if (host && slot && host.parentNode !== slot) slot.appendChild(host);
    if (expanded) dialogRef.current?.focus();
  }, [expanded, host]);

  // The page does not scroll under the enlarged view.
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  const collapse = useCallback(() => {
    // Moved back BEFORE the dialog unmounts: the dialog taking the video out
    // of the document with it would pause it.
    if (host && inlineSlot.current) inlineSlot.current.appendChild(host);
    setExpanded(false);
    expandButton.current?.focus();
  }, [host]);

  const video = () => videoRef.current;

  const togglePlay = () => {
    const element = video();
    if (!element) return;
    if (element.paused) void element.play().catch(() => {});
    else element.pause();
  };

  const seekTo = (seconds: number) => {
    const element = video();
    if (!element) return;
    const end = Number.isFinite(element.duration) ? element.duration : seconds;
    element.currentTime = clamp(seconds, 0, end);
    setTime(element.currentTime);
  };

  const skip = (delta: number) => {
    const element = video();
    if (element) seekTo(element.currentTime + delta);
  };

  const toggleMute = () => {
    const element = video();
    if (element) element.muted = !element.muted;
  };

  const changeVolume = (next: number) => {
    const element = video();
    if (!element) return;
    element.volume = clamp(Math.round(next * 100) / 100, 0, 1);
    if (element.volume > 0) element.muted = false;
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
    const element = video();
    if (element) element.playbackRate = next;
    setRate(next);
  };

  const readBuffered = (element: HTMLVideoElement) => {
    const ranges = element.buffered;
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= element.currentTime + 0.5 && element.currentTime <= ranges.end(i)) {
        setBuffered(ranges.end(i));
        return;
      }
    }
  };

  /**
   * The player's keys: Space/K play, ← → five seconds, ↑ ↓ volume, M mute,
   * F enlarge, Esc back. Marked handled so the recordings' bar
   * (`usePlayerKeys`) leaves them alone.
   */
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
    const element = video();
    switch (event.key) {
      case ' ':
      case 'k':
        if (!event.repeat) togglePlay();
        break;
      case 'ArrowLeft':
        skip(-SKIP_SECONDS);
        break;
      case 'ArrowRight':
        skip(SKIP_SECONDS);
        break;
      case 'ArrowUp':
        if (element) changeVolume(element.volume + VOLUME_STEP);
        break;
      case 'ArrowDown':
        if (element) changeVolume(element.volume - VOLUME_STEP);
        break;
      case 'm':
        toggleMute();
        break;
      case 'f':
        if (expanded) collapse();
        else setExpanded(true);
        break;
      case 'Escape':
        if (!expanded) return;
        collapse();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  // A focused button clicks itself on Space's keyup — after the keydown above
  // has already played or paused.
  const onKeyUp = (event: ReactKeyboardEvent) => {
    if (event.key === ' ') event.preventDefault();
  };

  const ratioAt = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
  };
  const onBarDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrub(ratioAt(event.clientX) * duration);
  };
  const onBarMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scrub !== null) setScrub(ratioAt(event.clientX) * duration);
  };
  const onBarUp = () => {
    if (scrub === null) return;
    seekTo(scrub);
    setScrub(null);
  };

  const shown = scrub ?? time;
  const played = duration > 0 ? (shown / duration) * 100 : 0;
  const loaded = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;
  const silent = muted || volume === 0;

  const surface = (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
    >
      <div className="relative aspect-video w-full bg-black">
        <video
          key={src}
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          autoPlay={autoPlay}
          // Kept from the publisher's own page, which serves them without a download.
          onContextMenu={(event) => event.preventDefault()}
          onClick={togglePlay}
          onLoadedMetadata={(event) => {
            const element = event.currentTarget;
            setDuration(element.duration);
            element.playbackRate = rate;
            element.volume = volume;
            element.muted = muted;
            if (resumeAt !== null) element.currentTime = resumeAt;
          }}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => {
            setTime(event.currentTarget.currentTime);
            readBuffered(event.currentTarget);
          }}
          onProgress={(event) => readBuffered(event.currentTarget)}
          onPlay={() => {
            setPlaying(true);
            onPlayingChange(true);
          }}
          onPause={() => {
            setPlaying(false);
            setWaiting(false);
            onPlayingChange(false);
          }}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onVolumeChange={(event) => {
            setMuted(event.currentTarget.muted);
            setVolume(event.currentTarget.volume);
          }}
          onError={() => {
            setPlaying(false);
            setWaiting(false);
            onPlayingChange(false);
            onError();
          }}
          className="h-full w-full cursor-pointer"
        />
        {/* Paused: a large play in the middle, where the eye already is. */}
        {(!playing || waiting) && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={t('pdf.video.play')}
            className="absolute left-1/2 top-1/2 inline-flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/75"
          >
            {waiting ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Play className="ms-0.5 h-6 w-6 fill-current" />
            )}
          </button>
        )}
      </div>

      {/* Under the picture, never on it — the picture carries its own subtitles.
          Left to right in every language: time runs that way on a timeline. */}
      <div dir="ltr" className="border-t border-border bg-muted px-3 pb-1.5 pt-1">
        <div
          ref={barRef}
          role="slider"
          tabIndex={-1}
          aria-label={t('pdf.video.position')}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(shown)}
          aria-valuetext={`${formatTime(shown)} / ${formatTime(duration)}`}
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onPointerCancel={() => setScrub(null)}
          className="group relative h-4 cursor-pointer touch-none"
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 bg-primary/25"
              style={{ width: `${loaded}%` }}
            />
            <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${played}%` }} />
          </div>
          <div
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-lg transition-transform ${
              scrub !== null ? 'scale-125' : 'scale-0 group-hover:scale-100'
            }`}
            style={{ left: `${played}%` }}
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => skip(-SKIP_SECONDS)}
            title={t('pdf.video.back', { n: SKIP_SECONDS })}
            aria-label={t('pdf.video.back', { n: SKIP_SECONDS })}
            className={iconBtn}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? t('pdf.video.pause') : t('pdf.video.play')}
            className={playBtn}
          >
            {playing && waiting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : playing ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="ms-0.5 h-4 w-4 fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={() => skip(SKIP_SECONDS)}
            title={t('pdf.video.forward', { n: SKIP_SECONDS })}
            aria-label={t('pdf.video.forward', { n: SKIP_SECONDS })}
            className={iconBtn}
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <span className="ms-1.5 whitespace-nowrap text-xs tabular-nums">
            <span className="font-semibold text-foreground">{formatTime(shown)}</span>
            <span className="text-muted-foreground"> / {formatTime(duration)}</span>
          </span>

          <span className="flex-1" />

          <button
            type="button"
            onClick={cycleSpeed}
            title={t('pdf.video.speed')}
            aria-label={t('pdf.video.speed')}
            // Neutral at normal speed; coloured once the learner has changed it.
            className={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-1.5 text-xs font-bold tabular-nums transition-colors hover:bg-muted ${
              rate === 1 ? 'text-muted-foreground' : 'text-accent'
            }`}
          >
            {rate}×
          </button>
          <button
            type="button"
            onClick={toggleMute}
            title={silent ? t('pdf.video.unmute') : t('pdf.video.mute')}
            aria-label={silent ? t('pdf.video.unmute') : t('pdf.video.mute')}
            className={iconBtn}
          >
            {silent ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          {expanded && (
            <input
              type="range"
              min={0}
              max={1}
              step={VOLUME_STEP}
              value={silent ? 0 : volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
              aria-label={t('pdf.video.volume')}
              className="hidden w-24 accent-primary sm:block"
            />
          )}
          <button
            ref={expandButton}
            type="button"
            onClick={() => (expanded ? collapse() : setExpanded(true))}
            title={expanded ? t('pdf.video.shrink') : t('pdf.video.enlarge')}
            aria-label={expanded ? t('pdf.video.shrink') : t('pdf.video.enlarge')}
            className={iconBtn}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Holds the player's place in the panel — and its height while it is enlarged. */}
      <div ref={inlineSlot}>
        {expanded && (
          <div className="flex aspect-video w-full items-center justify-center bg-muted text-xs text-muted-foreground">
            <Maximize2 className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>

      {host && createPortal(surface, host)}

      {expanded &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) collapse();
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              tabIndex={-1}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              // As wide as the window allows while the picture and its bars
              // still fit its height.
              className="flex w-full max-w-[min(64rem,calc((100dvh_-_10rem)*16/9))] flex-col overflow-hidden rounded-[9px] border border-border bg-card shadow-lg outline-none"
            >
              <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
                <p dir="auto" className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                  {title}
                </p>
                {headerExtra}
                <button
                  type="button"
                  onClick={collapse}
                  aria-label={t('pdf.video.shrink')}
                  title={t('pdf.video.shrink')}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div ref={dialogSlot} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
