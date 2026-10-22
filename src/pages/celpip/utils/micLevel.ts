// How loud the learner's microphone is, while they record a Speaking answer.
//
// Ported from flexi-lingo-front `components/speaking/mic-level.ts` (the pure
// maths). On the web the level comes from an AudioContext analyser; on desk the
// capture is native (CPAL), so Rust measures the live buffer (`celpip_record_level`,
// dBFS) and the page only decides what the readings mean.
//
// On 2026-10-02 a full mock's first two answers were recorded 20-25 dB quieter
// than the same learner's other answers: both were scored as silence and nobody
// on the page could tell. Measured on real answers (43 ms frames): in a normal
// answer 70-81% of frames are at or above -35 dBFS; in those two, 1-2%.
// HEARD_DBFS sits between the two groups.

/** A frame at or above this is a voice we can transcribe. */
export const HEARD_DBFS = -35;
/** Warn once the learner has been (nearly) inaudible for this long. */
export const QUIET_WINDOW_MS = 8000;
/** "Nearly": fewer than this share of readings in the window were heard. */
export const QUIET_MAX_HEARD_SHARE = 0.1;
/** The microphone test calls a voice heard after this many loud readings (~1 s). */
export const TEST_HEARD_READINGS = 5;
/** ...and gives up after this long without them. */
export const TEST_TIMEOUT_MS = 8000;
/** How often the page reads the level. */
export const LEVEL_POLL_MS = 200;

const FLOOR_DBFS = -100;

/** Loudness of one frame of samples (-1..1), in dBFS. Silence is the floor. */
export function frameDbfs(samples: ArrayLike<number>): number {
  if (samples.length === 0) return FLOOR_DBFS;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? Math.max(FLOOR_DBFS, 20 * Math.log10(rms)) : FLOOR_DBFS;
}

/** 0..1 for a level bar: the floor of speech (-60 dBFS) is empty, -10 dBFS is full. */
export function levelFraction(dbfs: number): number {
  if (!Number.isFinite(dbfs)) return 0;
  return Math.min(1, Math.max(0, (dbfs + 60) / 50));
}

/**
 * Says when a recording learner has been nearly inaudible for QUIET_WINDOW_MS.
 * A reading of NaN means "could not measure" and is ignored: no measurement,
 * no warning.
 */
export class QuietWatch {
  private readings: { at: number; heard: boolean }[] = [];
  private readonly startedAt: number;

  constructor(startedAt: number) {
    this.startedAt = startedAt;
  }

  push(at: number, dbfs: number): boolean {
    if (Number.isFinite(dbfs)) this.readings.push({ at, heard: dbfs >= HEARD_DBFS });
    const from = at - QUIET_WINDOW_MS;
    while (this.readings.length > 0 && this.readings[0].at < from) this.readings.shift();
    if (at - this.startedAt < QUIET_WINDOW_MS || this.readings.length === 0) return false;
    const heard = this.readings.filter((r) => r.heard).length;
    return heard / this.readings.length < QUIET_MAX_HEARD_SHARE;
  }
}

/** A finished answer gets a verdict only after this many readings (~2 s). */
export const TAKE_MIN_READINGS = 10;
/** The transcript has at least this many words: the answer is not silent, whatever the meter says. */
export const TRANSCRIPT_HEARD_WORDS = 3;

/** 'unmeasured': too few readings to say anything, so nothing is said. */
export type TakeVerdict = 'heard' | 'silent' | 'unmeasured';

/**
 * Was a whole recorded answer (nearly) inaudible? The same rule as the live
 * warning, over the whole answer instead of the last 8 s.
 */
export class TakeMeter {
  private heard = 0;
  private measured = 0;

  push(dbfs: number): void {
    if (!Number.isFinite(dbfs)) return;
    this.measured++;
    if (dbfs >= HEARD_DBFS) this.heard++;
  }

  verdict(): TakeVerdict {
    if (this.measured < TAKE_MIN_READINGS) return 'unmeasured';
    return this.heard / this.measured < QUIET_MAX_HEARD_SHARE ? 'silent' : 'heard';
  }
}

/**
 * Stop and ask about this answer? Only when the meter says silent and the local
 * transcript did not hear words either - a transcript with words means the meter
 * is the one that is wrong, and the learner must not be stopped.
 */
export function isSilentTake(verdict: TakeVerdict, transcript: string): boolean {
  if (verdict !== 'silent') return false;
  const words = transcript.trim() === '' ? 0 : transcript.trim().split(/\s+/).length;
  return words < TRANSCRIPT_HEARD_WORDS;
}

/**
 * Every task so far was silent: the verdicts of the earlier tasks, then the
 * current one. A task with no verdict (skipped, or answered before a reload)
 * is not known to be silent, so it breaks the run.
 */
export function everyTakeSilent(verdicts: ReadonlyArray<TakeVerdict | undefined>): boolean {
  return verdicts.length > 0 && verdicts.every((v) => v === 'silent');
}

/** 'unmeasured': no readings at all, so the test says nothing. */
export type MicTestResult = 'listening' | 'heard' | 'quiet' | 'unmeasured';

/** The microphone test before the section: did we hear about a second of voice? */
export class MicTest {
  private heard = 0;
  private measured = 0;
  private readonly startedAt: number;

  constructor(startedAt: number) {
    this.startedAt = startedAt;
  }

  push(at: number, dbfs: number): MicTestResult {
    if (Number.isFinite(dbfs)) {
      this.measured++;
      if (dbfs >= HEARD_DBFS) this.heard++;
    }
    if (this.heard >= TEST_HEARD_READINGS) return 'heard';
    if (at - this.startedAt < TEST_TIMEOUT_MS) return 'listening';
    return this.measured > 0 ? 'quiet' : 'unmeasured';
  }
}
