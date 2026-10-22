import { describe, expect, it } from 'vitest';
import {
  createShadowQueue,
  passOrder,
  REVEAL_MIN_GAP_MS,
  type QueueItem,
  type QueueSettings,
} from '../src/pages/study/lib/shadowQueue';

/**
 * The shadowing rule: the run moves on when the SOUND ENDS, never on a timer, and the pause
 * the learner repeats into is exactly the length they set — fractions of a second included.
 */

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function harness(overrides: Partial<QueueSettings> = {}) {
  const log: string[] = [];
  const sleeps: number[] = [];
  const pending: { text: string; lang: string; end: () => void }[] = [];
  let clock = 0;
  const settings: QueueSettings = {
    gapMs: 1300,
    repeat: 1,
    repeatEach: 1,
    speakSecondary: false,
    revealAfterGap: false,
    manualAdvance: false,
    shuffle: false,
    ...overrides,
  };
  const deps = {
    // A voice that speaks until the test says it has ended.
    speak: (text: string, lang: string) =>
      new Promise<void>((resolve) => {
        log.push(`speak:${text}`);
        pending.push({ text, lang, end: resolve });
      }),
    stop: () => {
      log.push('stop');
      pending.splice(0).forEach((p) => p.end());
    },
    // The clock resolves instantly: what matters is WHEN it is asked, and for how long.
    sleep: (ms: number) => {
      sleeps.push(ms);
      log.push(`sleep:${ms}`);
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
    random: () => 0,
  };
  const queue = createShadowQueue(deps, () => settings);
  /** Ends the voice that is speaking now. */
  const end = async () => {
    const p = pending.shift();
    p?.end();
    await flush();
  };
  return { queue, log, sleeps, settings, pending, end, advance: (ms: number) => (clock += ms) };
}

const items = (...texts: string[]): QueueItem[] =>
  texts.map((text) => ({ id: text, text, language: 'fr', secondaryText: `${text}-meaning`, secondaryLanguage: 'fa' }));

describe('shadowing sequencing: the run moves on when the audio ends', () => {
  it('never starts the pause, nor the next word, before the sound has ended', async () => {
    const h = harness();
    void h.queue.playAll(items('a', 'b'));
    await flush();
    expect(h.log).toEqual(['speak:a']); // word one is sounding: no pause started, no word two
    await flush();
    await flush();
    expect(h.log).toEqual(['speak:a']); // however long it takes
    await h.end();
    await flush();
    // Only now does the pause begin, and only after it does word two start.
    expect(h.log).toEqual(['speak:a', 'sleep:1300', 'speak:b']);
  });

  it('honours a fractional pause exactly: 1.3 s is 1300 ms, not 1000 and not 2000', async () => {
    const h = harness({ gapMs: 1300 });
    void h.queue.playAll(items('a', 'b'));
    await flush();
    await h.end();
    expect(h.sleeps).toEqual([1300]);

    const h2 = harness({ gapMs: 3400, repeatEach: 2 });
    void h2.queue.playAll(items('a', 'b'));
    await flush();
    await h2.end(); // first repeat of a
    expect(h2.sleeps).toEqual([3400]); // the pause between the two repeats
    const h3 = harness({ gapMs: 250 });
    void h3.queue.playAll(items('a', 'b'));
    await flush();
    await h3.end();
    expect(h3.sleeps).toEqual([250]);
  });

  it('says each word repeatEach times with the pause between the repeats, and the meaning after', async () => {
    const h = harness({ repeatEach: 2, speakSecondary: true, gapMs: 1300 });
    void h.queue.playAll(items('a'));
    await flush();
    await h.end();
    await h.end(); // second repeat of the word
    expect(h.log.slice(0, 5)).toEqual(['speak:a', 'sleep:1300', 'speak:a', 'sleep:1300', 'speak:a-meaning']);
    expect(h.pending[0].lang).toBe('fa'); // the meaning is read in its own language
    expect(h.queue.getState().utterance).toBe(0); // 0 = the meaning, not a repeat of the word
  });

  it('holds a recall pause before the meaning, of at least a second, and counts it in playing time', async () => {
    const h = harness({ revealAfterGap: true, gapMs: 1300 });
    void h.queue.playAll(items('a', 'b'));
    await flush();
    expect(h.queue.getState().phase).toBe('word');
    await h.end();
    await flush();
    // The recall pause is the gap in 100 ms slices that add up to exactly 1.3 s, then the answer phase.
    const recall = h.sleeps.slice(0, 13);
    expect(recall.every((ms) => ms === 100)).toBe(true);
    expect(h.sleeps.slice(0, 13).reduce((a, b) => a + b, 0)).toBe(1300);

    const short = harness({ revealAfterGap: true, gapMs: 300 });
    void short.queue.playAll(items('a'));
    await flush();
    await short.end();
    await flush();
    expect(short.sleeps.slice(0, 10).reduce((a, b) => a + b, 0)).toBe(REVEAL_MIN_GAP_MS);
  });

  it('holds after each word until next() when it does not move on by itself', async () => {
    const h = harness({ manualAdvance: true });
    void h.queue.playAll(items('a', 'b'));
    await flush();
    await h.end();
    await flush();
    expect(h.queue.getState().awaitingNext).toBe(true);
    expect(h.sleeps).toEqual([]); // no timed gap: it lasts exactly as long as the learner takes
    expect(h.log).toEqual(['speak:a']);
    h.queue.next();
    await flush();
    expect(h.log).toEqual(['speak:a', 'speak:b']);
  });

  it('a pause pressed mid-word cuts the voice and says the word again, whole, on resume', async () => {
    const h = harness();
    void h.queue.playAll(items('a', 'b'));
    await flush();
    h.queue.pause();
    await flush();
    expect(h.log).toEqual(['speak:a', 'stop']);
    expect(h.queue.getState().isPaused).toBe(true);
    await flush();
    expect(h.log).toEqual(['speak:a', 'stop']); // nothing moves while held
    h.queue.resume();
    await flush();
    expect(h.log).toEqual(['speak:a', 'stop', 'speak:a']); // not skipped, not half-heard
  });

  it('passes: rounds repeat the list, a finished run is reported once, a reset is not a finish', async () => {
    const h = harness({ repeat: 2, gapMs: 0 });
    const done = h.queue.playAll(items('a'));
    await flush();
    await h.end();
    await flush();
    expect(h.queue.getState().pass).toBe(1);
    await h.end();
    expect(await done).toBe('finished');
    expect(h.queue.getState().completedRuns).toBe(1);
    expect(h.queue.getState().isPlaying).toBe(false);

    const h2 = harness();
    const run = h2.queue.playAll(items('a', 'b'));
    await flush();
    h2.queue.reset();
    expect(await run).toBe('superseded');
    expect(h2.queue.getState().completedRuns).toBe(0);
  });

  it('a repeat count lowered mid-word applies at once (no "6 of 5")', async () => {
    const h = harness({ repeatEach: 3, gapMs: 0 });
    void h.queue.playAll(items('a', 'b'));
    await flush();
    h.settings.repeatEach = 1; // lowered while the first repeat is still sounding
    await h.end();
    await flush();
    expect(h.log.filter((l) => l === 'speak:a').length).toBe(1);
    expect(h.log).toContain('speak:b');
  });

  it('plays banked time only: a pause does not run the stopwatch', async () => {
    const h = harness({ gapMs: 0 });
    void h.queue.playAll(items('a'));
    await flush();
    h.advance(4000);
    h.queue.pause();
    expect(h.queue.getState().elapsedMs).toBe(4000);
    h.advance(60_000); // away
    h.queue.resume();
    h.advance(1000);
    expect(h.queue.elapsedNow()).toBe(5000);
  });

  it('a shuffled pass re-orders the list and keeps a picked word first', () => {
    const rng = (() => {
      let i = 0;
      const seq = [0.9, 0.1, 0.5, 0.3];
      return () => seq[i++ % seq.length];
    })();
    expect(passOrder(4, -1, false, rng)).toEqual([0, 1, 2, 3]);
    const order = passOrder(5, 3, true, rng);
    expect(order[0]).toBe(3);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
