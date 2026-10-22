/**
 * One full listen of a recording — the rule that opens a book track's subtitles.
 *
 * A pass counts when the recording has been heard from its first second to its
 * last, at normal speed:
 *  - going BACK is fine: hearing a line again only repeats what was heard;
 *  - skipping FORWARD, even one second, leaves a stretch unheard, and nothing
 *    after it counts until the listener comes back to where they left off;
 *  - faster than 1× does not count: five plays at 2× is skipping in disguise.
 *    Slower is fine.
 *
 * So the whole state is one number, `heardTo`: how far the recording has been
 * heard WITHOUT A GAP from its start. Playback moves it only when it runs from
 * a point at or before it. A seek never moves it — forward it leaves a gap,
 * backward it lands on ground already covered.
 *
 * Pure on purpose (no DOM, no React): the player feeds it samples of the
 * `<audio>` element, and the tests feed it made-up ones.
 */

export interface PassSample {
  /** `audio.currentTime`, seconds. */
  time: number;
  /** `performance.now()`, milliseconds. */
  at: number;
  /** `!audio.paused`. */
  playing: boolean;
  /** `audio.playbackRate`. */
  rate: number;
}

/** A `timeupdate` reports a moment slightly behind the playhead. */
const SLACK = 0.35;
/** Timer jitter allowed between the audio's clock and the wall clock. */
const JITTER = 0.5;
/** The last `timeupdate` lands a little before the end, and some MP3s end early. */
const END_SLACK = 1;
/** Float noise on a rate that is meant to be exactly 1. */
const NORMAL_RATE = 1.001;

export class ListenPass {
  heardTo: number;
  private last: PassSample | null = null;

  constructor(heardTo = 0) {
    this.heardTo = Math.max(0, heardTo);
  }

  /**
   * The playhead was moved — a seek, or a new file loaded — and now stands at
   * `time`. The next sample continues from here, not from where it was.
   */
  moved(time: number, at: number): void {
    this.last = { time, at, playing: false, rate: 1 };
  }

  /** One `timeupdate`. True when it completes a pass. */
  sample(next: PassSample, duration: number): boolean {
    const previous = this.last;
    this.last = next;
    if (!previous) return false;

    const step = next.time - previous.time;
    const wall = (next.at - previous.at) / 1000;
    // Played, not jumped: moving forward no faster than the clock on the wall.
    // A jump that fired no `seeking` (the player nudging a file that has not
    // loaded yet) is caught here too.
    const played = next.playing && next.rate <= NORMAL_RATE && step > 0 && step <= wall + JITTER;
    if (played && previous.time <= this.heardTo + SLACK) {
      this.heardTo = Math.max(this.heardTo, next.time);
    }
    return this.completeAt(duration);
  }

  /**
   * The recording ended at `time`. Checked against where it really ended rather
   * than the reported duration: an MP3 without a length header can report a
   * duration a second or two longer than the audio it holds.
   */
  ended(time: number): boolean {
    const last = this.last;
    if (last && last.time <= this.heardTo + SLACK) this.heardTo = Math.max(this.heardTo, last.time);
    return this.completeAt(time);
  }

  private completeAt(end: number): boolean {
    if (!Number.isFinite(end) || end <= 0 || this.heardTo < end - END_SLACK) return false;
    // The next pass starts from nothing. The tail still playing after this
    // moment is not the start of the next one: it runs from past `heardTo`.
    this.heardTo = 0;
    return true;
  }
}
