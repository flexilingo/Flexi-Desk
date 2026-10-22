/**
 * The shadowing run loop — the website's `useSpeechQueue`, as a plain controller
 * so it can be tested without a browser, a voice or a clock.
 *
 * THE RULE THIS FILE EXISTS FOR: the run moves on when the SOUND ENDS, never on a
 * timer. Every step awaits `deps.speak(...)`, which resolves only when the voice
 * has finished (see `@/lib/speech`), and only then does the pause begin. That
 * pause is the exercise — it is when the learner says the word back — so it is
 * exactly the length they set, fractions of a second included (1.3 s is 1300 ms,
 * not 1 s and not 2 s). A fixed timer would cut a long word off or leave dead air
 * after a short one, and either way the pause would be the wrong length.
 */

export interface QueueItem {
  /** Stable identity — what `currentId` reports back. */
  id: string;
  text: string;
  /** Our language code ('fr', 'fa', …). Picks the voice. */
  language: string;
  /** Spoken after `text`, in the same turn — the meaning in the learner's language. */
  secondaryText?: string;
  secondaryLanguage?: string;
}

/**
 * Where in an entry the run is: the word and the gaps between its repeats, the
 * recall pause after the last repeat (only with `revealAfterGap`), then everything
 * after it — the meaning and the gap before the next entry.
 */
export type QueuePhase = 'word' | 'recall' | 'answer';

export interface QueueSettings {
  /** Silence between utterances, in ms. Fractions of a second are honoured. */
  gapMs: number;
  /** Passes over the whole list; `'infinite'` loops until stopped. */
  repeat: number | 'infinite';
  /** How many times each entry is spoken before moving on. */
  repeatEach: number;
  /** Speak each item's `secondaryText` after its `text`. */
  speakSecondary: boolean;
  /** A pause of its own after the last repeat, so the meaning can stay hidden until it is over. */
  revealAfterGap: boolean;
  /** Hold after every word until `next()` is called. */
  manualAdvance: boolean;
  /** Re-order the list at the start of every run and every round. */
  shuffle: boolean;
}

export interface QueueDeps {
  /** Say it; resolves when the sound has ENDED (or was cut off). Never rejects. */
  speak: (text: string, language: string) => Promise<void>;
  /** Cut off whatever is being said. */
  stop: () => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
}

export interface QueueState {
  isPlaying: boolean;
  isPaused: boolean;
  currentId: string | null;
  /** 0-based index of the pass through the list. */
  pass: number;
  /** 1-based position within the current pass. */
  step: number;
  /** Which utterance of the entry sounds: 1..repeatEach for the word, 0 for its meaning. */
  utterance: number;
  phase: QueuePhase;
  /** Holding after a word, waiting for `next()`. Only ever true under `manualAdvance`. */
  awaitingNext: boolean;
  /** Ids of the current pass in the order it lays them out. */
  orderIds: string[];
  /** Time spent actually playing, in ms — a stopwatch, not a clock. */
  elapsedMs: number;
  /** Bumped each time a run reaches its end, so a screen can show "finished" once. */
  completedRuns: number;
}

/** The shortest pause a held-back meaning gets, before it and after it. */
export const REVEAL_MIN_GAP_MS = 1000;
/** How often the recall pause checks for a pause press. Short, so pausing is prompt. */
const RECALL_TICK_MS = 100;

const IDLE: QueueState = {
  isPlaying: false,
  isPaused: false,
  currentId: null,
  pass: 0,
  step: 0,
  utterance: 0,
  phase: 'word',
  awaitingNext: false,
  orderIds: [],
  elapsedMs: 0,
  completedRuns: 0,
};

/** Fisher-Yates, on a copy. */
function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The order a pass lays the list out in — ALWAYS the whole list. */
export function passOrder(
  length: number,
  pick: number,
  isShuffled: boolean,
  random: () => number,
): number[] {
  const all = Array.from({ length }, (_, i) => i);
  if (!isShuffled) return all;
  if (pick < 0 || pick >= length) return shuffled(all, random);
  return [
    pick,
    ...shuffled(
      all.filter((i) => i !== pick),
      random,
    ),
  ];
}

export function createShadowQueue(deps: QueueDeps, getSettings: () => QueueSettings) {
  let state: QueueState = IDLE;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<QueueState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  /** Bumped by every reset() and every new run, so a superseded loop exits at its next await. */
  let runId = 0;
  let paused = false;
  let speaking = false;
  /** Pause cut the sound mid-word: the word is said again from its start on resume. */
  let cutByPause = false;
  let pauseWaiters: (() => void)[] = [];
  let nextWaiters: (() => void)[] = [];
  let currentItem: QueueItem | null = null;
  let queueRef: QueueItem[] = [];
  let orderRef: number[] = [];
  let banked = 0;
  let stretchStartedAt: number | null = null;

  const releasePause = () => {
    const w = pauseWaiters;
    pauseWaiters = [];
    w.forEach((r) => r());
  };
  const releaseNext = () => {
    const w = nextWaiters;
    nextWaiters = [];
    w.forEach((r) => r());
  };

  const bankElapsed = () => {
    if (stretchStartedAt !== null) {
      banked += deps.now() - stretchStartedAt;
      stretchStartedAt = null;
    }
    set({ elapsedMs: banked });
  };

  /** The stopwatch as it reads right now — what a ticking display asks for. */
  const elapsedNow = () => banked + (stretchStartedAt === null ? 0 : deps.now() - stretchStartedAt);

  const waitWhilePaused = () =>
    paused ? new Promise<void>((resolve) => pauseWaiters.push(resolve)) : Promise.resolve();

  /**
   * Say one utterance and resolve when it has ENDED. A pause pressed mid-word cuts
   * the sound (the voice cannot be held), and the word is then said again from its
   * start once the run resumes — it is never skipped, never half-heard.
   */
  async function say(text: string, language: string, alive: () => boolean): Promise<void> {
    for (;;) {
      speaking = true;
      try {
        await deps.speak(text, language);
      } catch {
        // One word failing to speak must not end the run — go on.
      }
      speaking = false;
      if (!alive()) return;
      if (!cutByPause) return;
      cutByPause = false;
      await waitWhilePaused();
      if (!alive()) return;
    }
  }

  /** Wait `ms` of PLAYING time: a pause pressed to think must not run the clock out behind it. */
  async function sleepPlaying(ms: number, alive: () => boolean): Promise<void> {
    let left = ms;
    while (left > 0) {
      const slice = Math.min(left, RECALL_TICK_MS);
      await deps.sleep(slice);
      if (!alive()) return;
      if (paused) {
        await waitWhilePaused();
        if (!alive()) return;
        continue;
      }
      // Counted by the slice, not by the wall clock: a late wake must not skip the
      // fractional remainder, and the total is exactly what was asked for.
      left -= slice;
    }
  }

  async function runLoop(
    queue: QueueItem[],
    firstOrder: number[],
    startAt: number,
  ): Promise<'finished' | 'superseded'> {
    runId += 1;
    const id = runId;
    const alive = () => runId === id;
    paused = false;
    cutByPause = false;
    banked = 0;
    stretchStartedAt = deps.now();
    set({ isPlaying: true, isPaused: false, elapsedMs: 0, awaitingNext: false });

    let order = firstOrder;
    let from = Math.min(Math.max(0, startAt), order.length - 1);
    const publish = (o: number[]) => {
      orderRef = o;
      queueRef = queue;
      set({ orderIds: o.map((i) => queue[i].id) });
    };
    publish(order);

    for (let pass = 0; ; pass++) {
      for (let k = from; k < order.length; k++) {
        if (!alive()) return 'superseded';
        const item = queue[order[k]];
        currentItem = item;
        set({ currentId: item.id, pass, step: k + 1, phase: 'word', awaitingNext: false });

        // Say the word — possibly more than once — then its meaning. Everything
        // here is awaited: the run advances when the SOUND ends, never on a timer.
        // The count is read on every repeat, so lowering it mid-word applies at once.
        const times = () => Math.max(1, getSettings().repeatEach);
        for (let rep = 0; rep < times(); rep++) {
          set({ utterance: rep + 1 });
          await say(item.text, item.language, alive);
          if (!alive()) return 'superseded';
          if (rep + 1 < times()) {
            const gap = getSettings().gapMs;
            if (gap > 0) {
              await deps.sleep(gap);
              if (!alive()) return 'superseded';
            }
            await waitWhilePaused();
            if (!alive()) return 'superseded';
          }
        }

        // The pause to recall the meaning in, before it is shown.
        const revealing = getSettings().revealAfterGap;
        if (revealing) {
          set({ phase: 'recall' });
          await sleepPlaying(Math.max(getSettings().gapMs, REVEAL_MIN_GAP_MS), alive);
          if (!alive()) return 'superseded';
        }
        set({ phase: 'answer' });

        if (getSettings().speakSecondary && item.secondaryText?.trim()) {
          // Without a recall pause the meaning still gets a breath after the word.
          const gap = revealing ? 0 : getSettings().gapMs;
          if (gap > 0) {
            await deps.sleep(gap);
            if (!alive()) return 'superseded';
          }
          await waitWhilePaused();
          if (!alive()) return 'superseded';
          set({ utterance: 0 }); // 0 = the meaning, not one of the word's repeats
          await say(item.secondaryText, item.secondaryLanguage ?? item.language, alive);
          if (!alive()) return 'superseded';
        }

        // The gap between two words is the learner's turn. Automatically that is a
        // fixed length of silence; by hand it lasts exactly as long as they take.
        if (getSettings().manualAdvance) {
          bankElapsed();
          await new Promise<void>((resolve) => {
            nextWaiters.push(resolve);
            set({ awaitingNext: true });
          });
          if (!alive()) return 'superseded';
          stretchStartedAt = deps.now();
        } else {
          const gap = revealing
            ? Math.max(getSettings().gapMs, REVEAL_MIN_GAP_MS)
            : getSettings().gapMs;
          if (gap > 0) {
            await deps.sleep(gap);
            if (!alive()) return 'superseded';
          }
        }
        // Catches a pause pressed during the gap — the next word must not start.
        await waitWhilePaused();
        if (!alive()) return 'superseded';
      }

      // Settings are re-read every pass: turning repeat or shuffle on mid-run
      // decides what happens at the END of the pass being heard.
      const repeat = getSettings().repeat;
      if (repeat !== 'infinite' && pass + 1 >= Math.max(1, repeat)) break;
      order = passOrder(queue.length, -1, getSettings().shuffle, deps.random);
      from = 0;
      publish(order);
    }

    bankElapsed();
    currentItem = null;
    set({
      isPlaying: false,
      isPaused: false,
      awaitingNext: false,
      currentId: null,
      pass: 0,
      step: 0,
      utterance: 0,
      phase: 'word',
      completedRuns: state.completedRuns + 1,
    });
    return 'finished';
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    elapsedNow,

    /** Start a run over `items`. Resolves with how it ended; a superseded run is NOT a finished one. */
    async playAll(
      items: QueueItem[],
      startIndex = -1,
    ): Promise<'finished' | 'superseded' | 'empty'> {
      const queue = items.filter((i) => i.text.trim());
      if (queue.length === 0) return 'empty';
      const picked =
        startIndex >= 0 && startIndex < items.length
          ? queue.findIndex((i) => i.id === items[startIndex].id)
          : -1;
      const order = passOrder(queue.length, picked, getSettings().shuffle, deps.random);
      return runLoop(queue, order, picked < 0 ? 0 : order.indexOf(picked));
    },

    /** Hold the run where it is, mid-word, keeping its place. */
    pause() {
      if (paused || !state.isPlaying) return;
      paused = true;
      if (speaking) {
        cutByPause = true;
        deps.stop();
      }
      bankElapsed();
      set({ isPaused: true });
    },

    resume() {
      if (!paused) return;
      paused = false;
      stretchStartedAt = deps.now();
      set({ isPaused: false });
      releasePause();
    },

    /** End the run and forget where it was — the next play starts from the top. */
    reset() {
      runId += 1;
      paused = false;
      cutByPause = false;
      releasePause();
      releaseNext();
      currentItem = null;
      deps.stop();
      banked = 0;
      stretchStartedAt = null;
      orderRef = [];
      queueRef = [];
      state = { ...IDLE, completedRuns: state.completedRuns };
      listeners.forEach((l) => l());
    },

    /** Move on from a held word. No-op when the run is not holding. */
    next() {
      if (nextWaiters.length === 0) return;
      set({ awaitingNext: false });
      releaseNext();
    },

    /** Say the held word again, without advancing. */
    async replay() {
      const item = currentItem;
      if (!item) return;
      deps.stop();
      await deps.speak(item.text, item.language);
    },

    /** Layout the run is reading — for tests and for a list that renders in order. */
    layout: () => ({ order: orderRef, queue: queueRef }),

    /** Leaving the screen mid-run must not leave a voice reading to nobody. */
    dispose() {
      runId += 1;
      releasePause();
      releaseNext();
      deps.stop();
      listeners.clear();
    },
  };
}

export type ShadowQueue = ReturnType<typeof createShadowQueue>;
