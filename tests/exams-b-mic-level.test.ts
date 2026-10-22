import { describe, it, expect } from 'vitest';
import {
  HEARD_DBFS,
  MicTest,
  QUIET_WINDOW_MS,
  QuietWatch,
  TakeMeter,
  everyTakeSilent,
  frameDbfs,
  isSilentTake,
  levelFraction,
} from '@/pages/celpip/utils/micLevel';
import { detectOs, looksBlockedBySystem, micFailureOf } from '@/pages/celpip/services/micProbe';

describe('mic level maths', () => {
  it('measures loudness in dBFS: full scale is 0, silence is the floor', () => {
    expect(frameDbfs([])).toBe(-100);
    expect(frameDbfs([0, 0, 0])).toBe(-100);
    expect(frameDbfs([1, -1, 1, -1])).toBeCloseTo(0, 6);
    expect(frameDbfs([0.5, 0.5]) - frameDbfs([0.25, 0.25])).toBeCloseTo(6.02, 1);
  });

  it('maps the level bar: -60 dBFS is empty, -10 is full, garbage is empty', () => {
    expect(levelFraction(-60)).toBe(0);
    expect(levelFraction(-10)).toBe(1);
    expect(levelFraction(-35)).toBeCloseTo(0.5, 6);
    expect(levelFraction(Number.NaN)).toBe(0);
    expect(levelFraction(5)).toBe(1);
  });

  it('warns "too quiet" only after the window, and only when almost nothing was heard', () => {
    const watch = new QuietWatch(0);
    for (let at = 0; at < QUIET_WINDOW_MS; at += 200) expect(watch.push(at, -60)).toBe(false);
    expect(watch.push(QUIET_WINDOW_MS + 200, -60)).toBe(true);
    // a voice again: heard share rises above the limit and the warning clears
    let quiet = true;
    for (let at = QUIET_WINDOW_MS + 400; at < QUIET_WINDOW_MS + 9000; at += 200)
      quiet = watch.push(at, HEARD_DBFS + 5);
    expect(quiet).toBe(false);
  });

  it('never warns without a measurement', () => {
    const watch = new QuietWatch(0);
    expect(watch.push(QUIET_WINDOW_MS * 2, Number.NaN)).toBe(false);
  });

  it('gives a take a verdict only after enough readings', () => {
    const few = new TakeMeter();
    for (let i = 0; i < 5; i++) few.push(-80);
    expect(few.verdict()).toBe('unmeasured');
    const silent = new TakeMeter();
    for (let i = 0; i < 20; i++) silent.push(-80);
    expect(silent.verdict()).toBe('silent');
    const heard = new TakeMeter();
    for (let i = 0; i < 20; i++) heard.push(i % 2 ? -20 : -80);
    expect(heard.verdict()).toBe('heard');
  });

  it('stops on a silent take only when the local transcript heard no words either', () => {
    expect(isSilentTake('silent', '')).toBe(true);
    expect(isSilentTake('silent', 'ok')).toBe(true);
    expect(isSilentTake('silent', 'I think the park is nice')).toBe(false);
    expect(isSilentTake('heard', '')).toBe(false);
    expect(isSilentTake('unmeasured', '')).toBe(false);
  });

  it('knows when every answer so far was silent, and a skipped one breaks the run', () => {
    expect(everyTakeSilent(['silent', 'silent'])).toBe(true);
    expect(everyTakeSilent(['silent', undefined])).toBe(false);
    expect(everyTakeSilent(['silent', 'heard'])).toBe(false);
    expect(everyTakeSilent([])).toBe(false);
  });

  it('the microphone test hears a voice after ~1 s, says quiet at the timeout, and stays silent without readings', () => {
    const ok = new MicTest(0);
    let r = ok.push(0, -20);
    for (let i = 1; i < 5; i++) r = ok.push(i * 200, -20);
    expect(r).toBe('heard');
    const quiet = new MicTest(0);
    expect(quiet.push(100, -70)).toBe('listening');
    expect(quiet.push(9000, -70)).toBe('quiet');
    const none = new MicTest(0);
    expect(none.push(9000, Number.NaN)).toBe('unmeasured');
  });
});

describe('microphone access', () => {
  it('reads the cause of a failed capture start', () => {
    expect(micFailureOf('RECORDING_ALREADY_ACTIVE')).toBe('in-use');
    expect(micFailureOf('No default audio input device available')).toBe('no-device');
    expect(micFailureOf('Failed to build f32 stream: access denied')).toBe('denied');
  });

  it('detects the system, and macOS handing a blocked app digital silence', () => {
    expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
    expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(detectOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('other');
    expect(looksBlockedBySystem(-100, 'mac')).toBe(true);
    expect(looksBlockedBySystem(-50, 'mac')).toBe(false);
    expect(looksBlockedBySystem(-100, 'windows')).toBe(false);
  });
});
