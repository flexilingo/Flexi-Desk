// The video counterpart of the player's <audio> element. It speaks the same small interface the
// player store drives (currentTime, duration, playbackRate, volume, play, pause, events), but the
// picture is a chrome-less YouTube embed. One instance for the whole app: the iframe is created once
// inside a container the host component owns and is NEVER moved (moving an iframe reloads it).
//
// Two rules ported from the website:
//  - The FIRST play of each video is YouTube's own start button. A play started through the API never
//    counts as a YouTube view, so play() refuses until YouTube itself has reported PLAYING once.
//  - A play / seek asked for before the player is ready is kept and carried out on ready (a tap lost
//    to "play before ready" was a real bug).

import { create } from 'zustand';
import { loadYouTubeIframeApi, type YTPlayer } from './youtubeApi';

/** What the store needs from either media kind. HTMLAudioElement satisfies it. */
export interface MediaLike {
  currentTime: number;
  readonly duration: number;
  playbackRate: number;
  volume: number;
  readonly error: { code: number; message: string } | null;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: string, listener: () => void) => void;
}

/** What the UI shows about the surface. */
interface SurfaceUi {
  ready: boolean;
  /** This video has played at least once (YouTube's own button was used). */
  started: boolean;
  /** YouTube could not be reached or refused the embed. */
  trouble: boolean;
  /** The element the full player wants the picture laid over; null = floating mini player. */
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
}

export const useVideoSurface = create<SurfaceUi>((set) => ({
  ready: false,
  started: false,
  trouble: false,
  slot: null,
  setSlot: (slot) => set({ slot }),
}));

/** No player after this long: say so, and offer a way out, while it keeps trying. */
export const SLOW_START_MS = 20_000;
/** Right after a seek getCurrentTime() still reports the old time for a few frames. */
const SEEK_GUARD_MS = 1500;
const TICK_MS = 120;

const embedUrl = (youtubeId: string) => {
  const q = new URLSearchParams({
    enablejsapi: '1',
    modestbranding: '1',
    rel: '0',
    cc_load_policy: '0',
    iv_load_policy: '3',
    controls: '0',
    disablekb: '1',
    fs: '0',
    playsinline: '1',
  });
  // YouTube accepts an http(s) origin only; Tauri's own origin (tauri://localhost) is not one.
  if (/^https?:$/.test(window.location.protocol)) q.set('origin', window.location.origin);
  return `https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}?${q.toString()}`;
};

type Listener = () => void;

export class YouTubeMedia implements MediaLike {
  error: { code: number; message: string } | null = null;

  private listeners = new Map<string, Set<Listener>>();
  private container: HTMLElement | null = null;
  private youtubeId: string | null = null;
  private player: YTPlayer | null = null;
  private ready = false;
  private started = false;
  private generation = 0;
  private ticker: number | null = null;
  private slowTimer: number | null = null;
  private pending: { play: boolean | null; seek: number | null } = { play: null, seek: null };
  private rate = 1;
  private vol = 1;
  private lastTime = 0;
  private lastDuration = 0;
  private guard: { to: number; until: number } | null = null;

  // ── events ──
  addEventListener(type: string, listener: Listener): void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener);
  }
  private emit(type: string): void {
    this.listeners.get(type)?.forEach((l) => l());
  }

  // ── lifecycle ──
  get videoId(): string | null {
    return this.youtubeId;
  }
  get hasStarted(): boolean {
    return this.started;
  }
  get isReady(): boolean {
    return this.ready;
  }

  /** The host component's element the iframe lives in. Creates the player if a video is waiting. */
  attach(container: HTMLElement): void {
    this.container = container;
    if (this.youtubeId && !this.player) this.create();
  }

  detach(container: HTMLElement): void {
    if (this.container !== container) return;
    this.teardown();
    this.container = null;
    // The picture is gone (its host unmounted); a rebuilt player is a new one — YouTube's button again.
    this.started = false;
    useVideoSurface.setState({ ready: false, started: false });
  }

  /** Switch to a video. The same video again is a no-op, so coming back to a running one never restarts it. */
  load(youtubeId: string): void {
    if (this.youtubeId === youtubeId && (this.player || !this.container)) return;
    this.teardown();
    this.youtubeId = youtubeId;
    this.started = false;
    this.error = null;
    this.lastTime = 0;
    this.lastDuration = 0;
    useVideoSurface.setState({ ready: false, started: false, trouble: false });
    this.emit('loadstart');
    if (this.container) this.create();
  }

  /** Stop and forget the video (the mini player's close button). */
  unload(): void {
    this.teardown();
    this.youtubeId = null;
    this.started = false;
    this.lastTime = 0;
    this.lastDuration = 0;
    useVideoSurface.setState({ ready: false, started: false, trouble: false });
  }

  /** Build the player again for the same video — "Try again" on the error card. */
  retry(): void {
    const id = this.youtubeId;
    if (!id) return;
    this.teardown();
    this.error = null;
    useVideoSurface.setState({ ready: false, trouble: false });
    if (this.container) this.create();
  }

  private create(): void {
    const container = this.container;
    const youtubeId = this.youtubeId;
    if (!container || !youtubeId) return;
    const generation = ++this.generation;

    this.slowTimer = window.setTimeout(() => {
      if (generation === this.generation && !this.ready)
        useVideoSurface.setState({ trouble: true });
    }, SLOW_START_MS);

    loadYouTubeIframeApi()
      .then((YT) => {
        if (generation !== this.generation || !this.container) return;
        const iframe = document.createElement('iframe');
        iframe.src = embedUrl(youtubeId);
        iframe.title = 'YouTube video player';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        iframe.className = 'h-full w-full border-0';
        this.container.replaceChildren(iframe);
        this.player = new YT.Player(iframe, {
          events: {
            onReady: (e) => generation === this.generation && this.onReady(e.target),
            onStateChange: (e) => generation === this.generation && this.onState(e.data, e.target),
            // Our subtitle bar IS the captions; YouTube's module loads with playback, drop it each time.
            onApiChange: (e) => e.target.unloadModule?.('captions'),
            onError: (e) => generation === this.generation && this.onError(e.data),
          },
        });
      })
      .catch(() => {
        if (generation === this.generation) useVideoSurface.setState({ trouble: true });
      });
  }

  private teardown(): void {
    this.generation++;
    if (this.slowTimer !== null) window.clearTimeout(this.slowTimer);
    if (this.ticker !== null) window.clearInterval(this.ticker);
    this.slowTimer = this.ticker = null;
    this.ready = false;
    this.pending = { play: null, seek: null };
    this.guard = null;
    try {
      this.player?.destroy();
    } catch {
      /* happens during HMR */
    }
    this.player = null;
    this.container?.replaceChildren();
  }

  // ── YouTube callbacks ──
  private onReady(player: YTPlayer): void {
    this.ready = true;
    if (this.slowTimer !== null) window.clearTimeout(this.slowTimer);
    useVideoSurface.setState({ ready: true, trouble: false });
    player.setPlaybackRate(this.rate);
    player.setVolume(Math.round(this.vol * 100));
    // A seek on a video that has not played yet would START it (YouTube plays on seekTo), which is
    // exactly what must not happen before the first play — keep it until the video is running.
    if (this.started) {
      const { play, seek } = this.pending;
      this.pending = { play: null, seek: null };
      if (seek !== null) player.seekTo(seek, true);
      if (play) player.playVideo();
    }
    this.ticker = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
    this.emit('canplay');
  }

  private onState(state: number, player: YTPlayer): void {
    if (state === 0) this.emit('ended');
    else if (state === 1) {
      player.unloadModule?.('captions');
      if (!this.started) {
        this.started = true;
        useVideoSurface.setState({ started: true });
        // A line tapped in the transcript before the first play: jump there now that it runs.
        const seek = this.pending.seek;
        this.pending.seek = null;
        if (seek !== null) {
          this.guard = { to: seek, until: performance.now() + SEEK_GUARD_MS };
          player.seekTo(seek, true);
        }
      }
      this.emit('playing');
    } else if (state === 2) this.emit('pause');
    else if (state === 3) this.emit('waiting');
    else if (state === 5) this.emit('canplay');
  }

  private onError(code: number): void {
    this.error = { code, message: `YOUTUBE_ERROR_${code}` };
    useVideoSurface.setState({ trouble: true });
    this.emit('error');
  }

  private tick(): void {
    const p = this.readyPlayer();
    if (!p) return;
    const d = p.getDuration();
    if (typeof d === 'number' && d > 0 && Math.abs(d - this.lastDuration) > 0.5) {
      this.lastDuration = d;
      this.emit('durationchange');
    }
    if (!this.started) return; // unplayed: the clock sits at 0 (or at a tapped line, kept in lastTime)
    const t = p.getCurrentTime();
    if (typeof t !== 'number') return;
    const guard = this.guard;
    if (guard) {
      if (Math.abs(t - guard.to) < 1 || performance.now() > guard.until) this.guard = null;
      else return; // a stale report from before the seek
    }
    if (Math.abs(t - this.lastTime) >= 0.15) {
      this.lastTime = t;
      this.emit('timeupdate');
    }
  }

  /** The YT.Player object exists before its methods do; reading one early throws. */
  private readyPlayer(): YTPlayer | null {
    return this.ready ? this.player : null;
  }

  // ── MediaLike ──
  get currentTime(): number {
    if (!this.started) return this.pending.seek ?? this.lastTime;
    // Right after a seek the player still reports the old time: answer with where we are going.
    if (this.guard && performance.now() <= this.guard.until) return this.guard.to;
    return this.readyPlayer()?.getCurrentTime() ?? this.pending.seek ?? this.lastTime;
  }
  set currentTime(seconds: number) {
    const to = Math.max(0, this.lastDuration > 0 ? Math.min(seconds, this.lastDuration) : seconds);
    this.guard = { to, until: performance.now() + SEEK_GUARD_MS };
    this.lastTime = to;
    const p = this.readyPlayer();
    if (p && this.started) p.seekTo(to, true);
    else this.pending.seek = to;
  }

  get duration(): number {
    return this.readyPlayer()?.getDuration() || this.lastDuration;
  }

  get playbackRate(): number {
    return this.rate;
  }
  set playbackRate(rate: number) {
    this.rate = rate;
    this.readyPlayer()?.setPlaybackRate(rate);
  }

  get volume(): number {
    return this.vol;
  }
  set volume(v: number) {
    this.vol = Math.max(0, Math.min(1, v));
    this.readyPlayer()?.setVolume(Math.round(this.vol * 100));
  }

  /** Playing as far as the play/pause button is concerned (3 = buffering counts). */
  get isPlaying(): boolean {
    const s = this.readyPlayer()?.getPlayerState();
    return s === 1 || s === 3;
  }

  play(): Promise<void> {
    // Not started yet: only YouTube's own button may start it (see the header comment).
    if (!this.started) return Promise.reject(new Error('VIDEO_FIRST_PLAY_IS_YOUTUBES'));
    const p = this.readyPlayer();
    if (p) p.playVideo();
    else this.pending.play = true;
    return Promise.resolve();
  }

  pause(): void {
    const p = this.readyPlayer();
    if (p) p.pauseVideo();
    else this.pending.play = false;
  }
}

/** The app's one video surface. */
export const youtubeMedia = new YouTubeMedia();
