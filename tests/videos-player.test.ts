import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn(async (_cmd: string, _args?: unknown): Promise<unknown> => ({})));
vi.mock('@tauri-apps/api/core', () => ({ invoke, convertFileSrc: (p: string) => p }));

import { YouTubeMedia, useVideoSurface, youtubeMedia } from '@/pages/videos/player/YouTubeMedia';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import type { PodcastEpisode } from '@/pages/podcast/types';
import { VIDEO_PLAYER_CAPABILITIES } from '@/pages/videos/player/videoCapabilities';

// A stand-in for the YouTube IFrame API: records what we call and lets a test play the part of YouTube.
class FakePlayer {
  static last: FakePlayer | null = null;
  calls: string[] = [];
  state = -1;
  time = 0;
  constructor(public el: HTMLElement, public cfg: { events: Record<string, (e: unknown) => void> }) {
    FakePlayer.last = this;
    queueMicrotask(() => cfg.events.onReady({ target: this }));
  }
  playVideo() { this.calls.push('play'); }
  pauseVideo() { this.calls.push('pause'); }
  seekTo(s: number) { this.calls.push(`seek:${s}`); this.time = s; }
  getCurrentTime() { return this.time; }
  getDuration() { return 120; }
  setPlaybackRate(r: number) { this.calls.push(`rate:${r}`); }
  getPlaybackRate() { return 1; }
  getPlayerState() { return this.state; }
  mute() {} unMute() {} isMuted() { return false; }
  setVolume(v: number) { this.calls.push(`vol:${v}`); }
  getVolume() { return 100; }
  destroy() { this.calls.push('destroy'); }
  /** YouTube reporting a state change (its own start button, a click on the picture…). */
  yt(state: number) { this.state = state; this.cfg.events.onStateChange({ data: state, target: this }); }
}

HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.play = () => Promise.resolve();

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  FakePlayer.last = null;
  (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
  invoke.mockClear();
});
afterEach(() => {
  youtubeMedia.unload();
  usePlayerStore.getState().stop();
});

describe('the YouTube surface (player adapter)', () => {
  it('creates a chrome-less embed once, in the container, and drives it through the shared interface', async () => {
    const media = new YouTubeMedia();
    const box = document.createElement('div');
    media.attach(box);
    media.load('abc123def45');
    await flush();
    const iframe = box.querySelector('iframe')!;
    expect(iframe.src).toContain('https://www.youtube.com/embed/abc123def45');
    expect(iframe.src).toContain('controls=0');
    expect(iframe.src).toContain('enablejsapi=1');
    expect(useVideoSurface.getState().ready).toBe(true);
    media.playbackRate = 1.5;
    media.volume = 0.5;
    expect(FakePlayer.last!.calls).toEqual(expect.arrayContaining(['rate:1.5', 'vol:50']));
    expect(media.duration).toBe(120);
  });

  it('the first play is YouTube\'s own button: play() refuses until YouTube reports PLAYING once', async () => {
    const media = new YouTubeMedia();
    media.attach(document.createElement('div'));
    media.load('vid00000001');
    await flush();
    await expect(media.play()).rejects.toThrow();
    expect(FakePlayer.last!.calls).not.toContain('play');
    FakePlayer.last!.yt(1); // the viewer pressed YouTube's start button
    expect(media.hasStarted).toBe(true);
    await expect(media.play()).resolves.toBeUndefined();
    expect(FakePlayer.last!.calls).toContain('play');
  });

  it('a seek before the first play is kept, not sent (YouTube would start playing), and applied once it runs', async () => {
    const media = new YouTubeMedia();
    media.attach(document.createElement('div'));
    media.load('vid00000002');
    await flush();
    media.currentTime = 42;
    expect(FakePlayer.last!.calls.some((c) => c.startsWith('seek'))).toBe(false);
    expect(media.currentTime).toBe(42);
    FakePlayer.last!.yt(1);
    expect(FakePlayer.last!.calls).toContain('seek:42');
  });

  it('a play asked for before the player is ready is carried out when it is (not lost)', async () => {
    const media = new YouTubeMedia();
    media.attach(document.createElement('div'));
    media.load('vid00000003');
    await flush();
    const first = FakePlayer.last!;
    first.yt(1); // started once
    media.retry(); // the player is rebuilt and is not ready yet
    const playing = media.play(); // asked for NOW, before the new player exists
    expect(FakePlayer.last).toBe(first);
    await expect(playing).resolves.toBeUndefined(); // kept, not thrown
    await flush(); // the new player is ready
    expect(FakePlayer.last).not.toBe(first);
    expect(FakePlayer.last!.calls).toContain('play');
  });

  it('every new video starts over on YouTube\'s own button', async () => {
    const media = new YouTubeMedia();
    media.attach(document.createElement('div'));
    media.load('vid00000007');
    await flush();
    FakePlayer.last!.yt(1);
    media.load('vid00000008');
    await flush();
    expect(media.hasStarted).toBe(false);
    await expect(media.play()).rejects.toThrow();
  });

  it('shows trouble when YouTube refuses the embed, and retry builds the player again', async () => {
    const media = new YouTubeMedia();
    media.attach(document.createElement('div'));
    media.load('vid00000005');
    await flush();
    const first = FakePlayer.last!;
    (first.cfg.events.onError as (e: unknown) => void)({ data: 153 });
    expect(useVideoSurface.getState().trouble).toBe(true);
    expect(media.error?.message).toBe('YOUTUBE_ERROR_153');
    media.retry();
    await flush();
    expect(first.calls).toContain('destroy');
    expect(FakePlayer.last).not.toBe(first);
    expect(useVideoSurface.getState().trouble).toBe(false);
  });

  it('the same video again changes nothing (coming back never restarts it)', async () => {
    const media = new YouTubeMedia();
    media.attach(document.createElement('div'));
    media.load('vid00000006');
    await flush();
    const p = FakePlayer.last!;
    media.load('vid00000006');
    await flush();
    expect(FakePlayer.last).toBe(p);
    expect(p.calls).not.toContain('destroy');
  });
});

const videoEpisode = (): PodcastEpisode =>
  ({
    id: 'local-1', feedId: 'f', title: 'A video', audioUrl: 'https://www.youtube.com/watch?v=abc12345678', durationSeconds: 120,
    isDownloaded: false, playPosition: 0, isPlayed: false, transcriptStatus: 'none', createdAt: '', transcriptSource: 'local', cloudTranscriptStatus: 'unknown',
    youtubeId: 'abc12345678', catalogueVideoId: 'cat-1',
  }) as unknown as PodcastEpisode;

describe('the shared player store on a video', () => {
  it('loads the video without starting it, and keeps no listening position', async () => {
    usePlayerStore.getState().play(videoEpisode());
    await flush();
    const s = usePlayerStore.getState();
    expect(s.currentEpisode?.youtubeId).toBe('abc12345678');
    expect(s.isPlaying).toBe(false);
    expect(FakePlayer.last).toBeNull(); // no container yet (the Shell mounts it); nothing started
    expect(invoke).not.toHaveBeenCalledWith('podcast_update_progress', expect.anything());
  });

  it('play/pause before the first play does nothing; after YouTube started it, it follows the picture', async () => {
    const box = document.createElement('div');
    youtubeMedia.attach(box);
    usePlayerStore.getState().play(videoEpisode());
    await flush();
    usePlayerStore.getState().togglePlayPause();
    await flush();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(FakePlayer.last!.calls).not.toContain('play');

    FakePlayer.last!.yt(1);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    usePlayerStore.getState().togglePlayPause();
    expect(FakePlayer.last!.calls).toContain('pause');
    FakePlayer.last!.yt(2); // paused by a click on the picture itself
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    youtubeMedia.detach(box);
  });

  it('the end of a video offers Up next and reports nothing as a listened episode', async () => {
    const box = document.createElement('div');
    youtubeMedia.attach(box);
    usePlayerStore.getState().play(videoEpisode());
    await flush();
    FakePlayer.last!.yt(1);
    FakePlayer.last!.yt(0);
    const s = usePlayerStore.getState();
    expect(s.showCompleteOverlay).toBe(true);
    expect(s.isPlaying).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith('podcast_update_progress', expect.anything());
    youtubeMedia.detach(box);
  });

  it('a video has no transcribe, sync, feedback or download', () => {
    expect(VIDEO_PLAYER_CAPABILITIES).toEqual({ transcribe: false, sync: false, feedback: false, download: false });
  });
});
