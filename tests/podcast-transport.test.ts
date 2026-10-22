import { describe, expect, it } from 'vitest';
import {
  RESTART_WINDOW_SEC,
  isTypingTarget,
  lineIndexAt,
  nextLineStep,
  parseStartAt,
  prevLineStep,
  startRequestKey,
  stepVolume,
  transportAction,
  withSeekParam,
  type LastStep,
  type StepLine,
} from '@/pages/podcast/utils/transport';

// Three 4 s lines with a 1 s gap between them.
const lines: StepLine[] = [
  { start: 0, end: 4 },
  { start: 5, end: 9 },
  { start: 10, end: 14 },
];
const base = { lines, episodeId: 'ep', last: null as LastStep | null, nowMs: 100_000 };

describe('transport key map', () => {
  const opts = { volumeKeys: true };
  it('maps Space/K, arrows, J/L, M, B, P', () => {
    expect(transportAction({ key: ' ' }, opts)).toBe('togglePlay');
    expect(transportAction({ key: 'k' }, opts)).toBe('togglePlay');
    expect(transportAction({ key: 'K' }, opts)).toBe('togglePlay');
    expect(transportAction({ key: 'ArrowLeft' }, opts)).toBe('prevLine');
    expect(transportAction({ key: 'ArrowRight' }, opts)).toBe('nextLine');
    expect(transportAction({ key: 'j' }, opts)).toBe('back10');
    expect(transportAction({ key: 'L' }, opts)).toBe('forward10');
    expect(transportAction({ key: 'm' }, opts)).toBe('mute');
    expect(transportAction({ key: 'b' }, opts)).toBe('bookmark');
    expect(transportAction({ key: 'P' }, opts)).toBe('pip');
  });
  it('up/down are volume only where the page does not scroll', () => {
    expect(transportAction({ key: 'ArrowUp' }, { volumeKeys: true })).toBe('volumeUp');
    expect(transportAction({ key: 'ArrowDown' }, { volumeKeys: true })).toBe('volumeDown');
    expect(transportAction({ key: 'ArrowUp' }, { volumeKeys: false })).toBeNull();
  });
  it('leaves Ctrl/Cmd/Alt combos and other keys to the OS', () => {
    expect(transportAction({ key: 'k', metaKey: true }, opts)).toBeNull();
    expect(transportAction({ key: 'ArrowLeft', altKey: true }, opts)).toBeNull();
    expect(transportAction({ key: 'c', ctrlKey: true }, opts)).toBeNull();
    expect(transportAction({ key: 'x' }, opts)).toBeNull();
  });
  it('does not act while typing', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
  });
  it('volume steps by 5% and stays inside 0-1', () => {
    expect(stepVolume(0.5, 1)).toBe(0.55);
    expect(stepVolume(0.98, 1)).toBe(1);
    expect(stepVolume(0.02, -1)).toBe(0);
  });
});

describe('line stepping', () => {
  it('finds the line playing now', () => {
    expect(lineIndexAt(lines, 6)).toBe(1);
    expect(lineIndexAt(lines, 4.5)).toBe(-1);
  });

  it('previous: well into a line replays that line', () => {
    const r = prevLineStep({ ...base, time: 5 + RESTART_WINDOW_SEC + 0.5, activeIndex: 1 });
    expect(r).toEqual({ kind: 'line', index: 1 });
  });

  it('restart rule: within 1.5 s of the line start goes to the line before', () => {
    const r = prevLineStep({ ...base, time: 5.8, activeIndex: 1 });
    expect(r).toEqual({ kind: 'line', index: 0 });
  });

  it('the first line has nothing before it, so it restarts itself', () => {
    expect(prevLineStep({ ...base, time: 0.5, activeIndex: 0 })).toEqual({
      kind: 'line',
      index: 0,
    });
  });

  it('between lines (no active line) falls back to 5 seconds', () => {
    expect(prevLineStep({ ...base, time: 4.5, activeIndex: -1 })).toEqual({
      kind: 'skip',
      seconds: -5,
    });
  });

  it('next: the first line that starts after now', () => {
    expect(nextLineStep({ ...base, time: 6, activeIndex: 1 })).toEqual({ kind: 'line', index: 2 });
  });

  it('next at the last line falls back to +5 s', () => {
    expect(nextLineStep({ ...base, time: 11, activeIndex: 2 })).toEqual({
      kind: 'skip',
      seconds: 5,
    });
  });

  it('a quick second press counts from the line stepped to, not the stale clock', () => {
    // Pressed "previous" a moment ago and went to line 1; the clock has only just reached it.
    const last: LastStep = { index: 1, at: base.nowMs - 300, episodeId: 'ep' };
    const again = prevLineStep({ ...base, last, time: 5.2, activeIndex: 1 });
    expect(again).toEqual({ kind: 'line', index: 0 });
    // And a quick "next" never lands behind the line just stepped to.
    const fwd = nextLineStep({ ...base, last, time: 0.1, activeIndex: 0 });
    expect(fwd).toEqual({ kind: 'line', index: 2 });
  });

  it('a step older than 1.5 s, or from another episode, is forgotten', () => {
    const old: LastStep = { index: 1, at: base.nowMs - 2000, episodeId: 'ep' };
    expect(prevLineStep({ ...base, last: old, time: 13, activeIndex: 2 })).toEqual({
      kind: 'line',
      index: 2,
    });
    const other: LastStep = { index: 1, at: base.nowMs - 100, episodeId: 'other' };
    expect(prevLineStep({ ...base, last: other, time: 13, activeIndex: 2 })).toEqual({
      kind: 'line',
      index: 2,
    });
  });
});

describe('?t= and ?resume= (search moment, history, Notes)', () => {
  it('reads the second to start at', () => {
    expect(parseStartAt(new URLSearchParams('t=272'))).toBe(272);
    expect(parseStartAt(new URLSearchParams('resume=61.9'))).toBe(61);
    expect(parseStartAt(new URLSearchParams('t=abc'))).toBeNull();
    expect(parseStartAt(new URLSearchParams(''))).toBeNull();
  });

  it('the Notes page adds the second to the player route it is sent to', () => {
    expect(withSeekParam('/podcast/player/abc', 95.4)).toBe('/podcast/player/abc?t=95');
    expect(withSeekParam('/reader/pdf/abc', 95)).toBe('/reader/pdf/abc');
    expect(withSeekParam('/podcast/player/abc', null)).toBe('/podcast/player/abc');
  });

  it('the player seeks when the SAME episode is already loaded, once per request', () => {
    let last: string | null = null;
    // Loaded and playing episode ep1; a note at 95 s opens.
    let r = startRequestKey(last, 'ep1', 95);
    expect(r.apply).toBe(true);
    last = r.key;
    // A re-render with the same request does not seek again.
    r = startRequestKey(last, 'ep1', 95);
    expect(r.apply).toBe(false);
    // A second note of the same episode asks for another second: it seeks again.
    r = startRequestKey(last, 'ep1', 300);
    expect(r.apply).toBe(true);
    // No parameter: nothing to do.
    expect(startRequestKey(r.key, 'ep1', null).apply).toBe(false);
  });
});
