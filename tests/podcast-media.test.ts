import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SEEK_SECONDS,
  mediaPlaybackState,
  pushPositionState,
  registerMediaHandlers,
  type MediaSessionLike,
} from '@/pages/podcast/utils/mediaSession';
import { drawPipFrame, ellipsizePipText, wrapPipText, type PipPalette } from '@/pages/podcast/utils/pipFrame';
import { MIN_TIME_CHANGE_SECONDS, nextStudyDelta } from '@/pages/podcast/utils/studyTime';

function fakeSession() {
  const handlers = new Map<string, ((d: Record<string, number | undefined>) => void) | null>();
  const session: MediaSessionLike = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: (a, h) => void handlers.set(a, h),
    setPositionState: vi.fn(),
  };
  return { session, handlers };
}

describe('MediaSession handlers', () => {
  const controls = () => ({
    play: vi.fn(),
    pause: vi.fn(),
    skip: vi.fn(),
    seekTo: vi.fn(),
    prevLine: vi.fn(),
    nextLine: vi.fn(),
  });

  it('wires play, pause, stop, seek and the previous/next keys to the player', () => {
    const { session, handlers } = fakeSession();
    const c = controls();
    registerMediaHandlers(session, c);
    handlers.get('play')?.({});
    handlers.get('pause')?.({});
    handlers.get('stop')?.({});
    handlers.get('seekbackward')?.({});
    handlers.get('seekforward')?.({ seekOffset: 30 });
    handlers.get('seekto')?.({ seekTime: 42 });
    handlers.get('seekto')?.({});
    handlers.get('previoustrack')?.({});
    handlers.get('nexttrack')?.({});
    expect(c.play).toHaveBeenCalledTimes(1);
    expect(c.pause).toHaveBeenCalledTimes(2);
    expect(c.skip).toHaveBeenNthCalledWith(1, -DEFAULT_SEEK_SECONDS);
    expect(c.skip).toHaveBeenNthCalledWith(2, 30);
    expect(c.seekTo).toHaveBeenCalledTimes(1);
    expect(c.seekTo).toHaveBeenCalledWith(42);
    expect(c.prevLine).toHaveBeenCalledTimes(1);
    expect(c.nextLine).toHaveBeenCalledTimes(1);
  });

  it('does not take the track keys when the player has no line stepper, and cleans up', () => {
    const { session, handlers } = fakeSession();
    const { prevLine: _p, nextLine: _n, ...rest } = controls();
    const off = registerMediaHandlers(session, rest);
    expect(handlers.has('previoustrack')).toBe(false);
    off();
    expect(handlers.get('play')).toBeNull();
  });

  it('survives a browser that throws on an action it lacks', () => {
    const { session } = fakeSession();
    session.setActionHandler = () => {
      throw new Error('unsupported');
    };
    expect(() => registerMediaHandlers(session, controls())()).not.toThrow();
  });

  it('pushes position state only for a real duration, clamped', () => {
    const { session } = fakeSession();
    expect(pushPositionState(session, { duration: NaN, position: 1, rate: 1 })).toBe(false);
    expect(pushPositionState(session, { duration: 100, position: 140, rate: 0 })).toBe(true);
    expect(session.setPositionState).toHaveBeenCalledWith({ duration: 100, position: 100, playbackRate: 1 });
    expect(mediaPlaybackState(false, true)).toBe('none');
    expect(mediaPlaybackState(true, false)).toBe('paused');
  });
});

describe('Picture-in-Picture frame', () => {
  // A canvas whose text is 10 px per character, recording every fillText.
  function fakeCanvas() {
    const draws: { text: string; x: number; y: number; font: string }[] = [];
    const ctx = {
      font: '',
      direction: 'ltr',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      measureText: (t: string) => ({ width: t.length * 10 }),
      fillText(text: string, x: number, y: number) {
        draws.push({ text, x, y, font: this.font });
      },
      fillRect: vi.fn(),
    };
    const canvas = { width: 960, height: 540, getContext: () => ctx } as unknown as HTMLCanvasElement;
    return { canvas, draws };
  }
  const palette: PipPalette = { ground: '#fff', ink: '#000', subtext: '#444', caption: '#666', accent: '#0a0', track: '#ddd', font: 'sans-serif' };

  it('draws the title, show, spoken line and next line', () => {
    const { canvas, draws } = fakeCanvas();
    drawPipFrame(canvas, { title: 'Episode', subtitle: 'The Show', line: 'Hello there', nextLine: 'And then', idle: 'idle', progress: 0.5 }, palette);
    const texts = draws.map((d) => d.text);
    expect(texts).toContain('Episode');
    expect(texts).toContain('The Show');
    expect(texts).toContain('Hello there');
    expect(texts).toContain('And then');
    expect(texts).not.toContain('idle');
  });

  it('says the idle text between lines and shows no next line', () => {
    const { canvas, draws } = fakeCanvas();
    drawPipFrame(canvas, { title: 'Episode', subtitle: null, line: null, nextLine: 'ignored', idle: 'Subtitles are off', progress: 0 }, palette);
    const texts = draws.map((d) => d.text);
    expect(texts).toContain('Subtitles are off');
    expect(texts).not.toContain('ignored');
  });

  it('wraps a long line within the width and ellipsizes a long title', () => {
    const { canvas } = fakeCanvas();
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const lines = wrapPipText(ctx, 'one two three four five six', 100);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length * 10 <= 100)).toBe(true);
    expect(ellipsizePipText(ctx, 'a very long title indeed', 80).endsWith('…')).toBe(true);
    expect(ellipsizePipText(ctx, 'short', 80)).toBe('short');
  });

  it('breaks a spaceless word (Chinese) by character', () => {
    const { canvas } = fakeCanvas();
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const lines = wrapPipText(ctx, '今天天气很好我们出去', 50);
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe('study time sync', () => {
  const zero = { seconds: 0, clicks: 0, words: 0 };
  it('waits for 30 s of listening unless words were clicked', () => {
    expect(nextStudyDelta(zero, { seconds: MIN_TIME_CHANGE_SECONDS - 1, clicks: 0, words: 0 })).toBeNull();
    expect(nextStudyDelta(zero, { seconds: 31, clicks: 0, words: 0 })).toEqual({
      deltaTimeSeconds: 31,
      newWordsEncountered: 0,
      newClickedWords: 0,
    });
    expect(nextStudyDelta(zero, { seconds: 5, clicks: 2, words: 2 })?.newClickedWords).toBe(2);
  });
  it('sends only the change since the last accepted sync', () => {
    expect(nextStudyDelta({ seconds: 60, clicks: 1, words: 1 }, { seconds: 100, clicks: 1, words: 1 })).toBeNull();
    expect(nextStudyDelta({ seconds: 60, clicks: 1, words: 1 }, { seconds: 125, clicks: 1, words: 1 })?.deltaTimeSeconds).toBe(65);
  });
});
