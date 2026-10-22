/**
 * Sending a finished exam section when the connection comes and goes.
 *
 * 2026-10-19: a learner on the installed Android web app answered all of
 * CELPIP Reading Part 1, pressed Submit twice during a ~30 s connection drop,
 * got "Failed to submit section" twice (no request reached the server), left —
 * and the server held 0 answers. Another learner lost a section the same way.
 *
 * So a submit that never got an answer is kept and sent again by itself: on a
 * short backoff, when the browser reports it is online, and when the page comes
 * back into view. The section's answers are already in the local draft; the
 * payload the learner submitted is kept here (and on the device by the caller)
 * so the retry sends exactly what they submitted.
 *
 * Never two requests at once: a submit while one is in flight only replaces
 * what the next try will send. The server is idempotent on top of that — a
 * second submit of a held section answers SECTION_ALREADY_SUBMITTED.
 */

export type SubmitOutcome =
  | { kind: 'sent' }
  /** The server already holds this section (an earlier reply was lost, or a race). */
  | { kind: 'held'; code: string }
  /** The request never got an answer: no connection. */
  | { kind: 'offline' }
  /** The gateway answered for a server that did not (502/503/504, timeout). */
  | { kind: 'unreachable' }
  /** The server answered and refused; the learner has to see why. */
  | { kind: 'rejected'; code?: string };

/** submit_section codes meaning the server is already past this section. */
export const SECTION_ALREADY_HELD: ReadonlySet<string> = new Set([
  'SECTION_ALREADY_SUBMITTED',
  'WRONG_SECTION_ORDER',
  'EXAM_ALREADY_COMPLETE',
]);

const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** A request that never got an answer (reqwest's "API request failed", DNS, refused, timed out). */
const NO_ANSWER =
  /api request failed|error sending request|dns error|connection (?:refused|reset|closed|error)|timed out|timeout|network|offline|failed to fetch|(?<![a-z])load failed/i;

/**
 * What a `supabaseCall` rejection means for this submit. Desk's edge calls reject
 * with a JSON string `{ status, error, code, data }` when the server answered, and
 * with a bare message when the request never got an answer.
 * `online` is `navigator.onLine` at the time (undefined when unknown).
 */
export function classifySubmitError(err: unknown, online?: boolean): SubmitOutcome {
  const raw =
    typeof err === 'string' ? err : err instanceof Error ? err.message : String(err ?? '');
  let parsed: { status?: unknown; code?: unknown } | null = null;
  try {
    const value = JSON.parse(raw.replace(/^Error:\s*/, '')) as unknown;
    if (value && typeof value === 'object') parsed = value as { status?: unknown; code?: unknown };
  } catch {
    parsed = null;
  }
  if (parsed) {
    const code = typeof parsed.code === 'string' && parsed.code !== '' ? parsed.code : undefined;
    if (code)
      return SECTION_ALREADY_HELD.has(code) ? { kind: 'held', code } : { kind: 'rejected', code };
    const status = typeof parsed.status === 'number' ? parsed.status : null;
    if (status !== null && (GATEWAY_STATUSES.has(status) || status === 408))
      return { kind: 'unreachable' };
    return { kind: 'rejected' };
  }
  if (online === false || NO_ANSWER.test(raw)) return { kind: 'offline' };
  return { kind: 'rejected' };
}

export function isRetryable(outcome: SubmitOutcome): boolean {
  return outcome.kind === 'offline' || outcome.kind === 'unreachable';
}

/** Pause before the next automatic try, by failures so far; the last one repeats. */
export const SUBMIT_RETRY_DELAYS_MS = [3_000, 6_000, 12_000, 20_000, 30_000] as const;

export function retryDelayMs(
  failures: number,
  delays: readonly number[] = SUBMIT_RETRY_DELAYS_MS,
): number {
  if (delays.length === 0) return 0;
  const i = Math.min(Math.max(failures, 1), delays.length) - 1;
  return delays[i];
}

export interface SubmitRetryQueueOptions<P> {
  /** One request. Must resolve with an outcome, never reject. */
  attempt: (payload: P) => Promise<SubmitOutcome>;
  /**
   * After every request. `failures` counts the network failures of this
   * streak: including this request when it was one, the ones before it when
   * it ended the streak (sent after 2 drops → 2).
   */
  onSettled?: (outcome: SubmitOutcome, payload: P, failures: number) => void;
  delays?: readonly number[];
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/**
 * At most one submit in flight; a network failure keeps the payload and tries
 * again by itself until it is sent, held, refused, or the queue is paused.
 */
export class SubmitRetryQueue<P> {
  private pending: P | null = null;
  private inFlight = false;
  private failures = 0;
  private timer: unknown = null;
  private paused = false;
  private readonly opts: SubmitRetryQueueOptions<P>;

  constructor(opts: SubmitRetryQueueOptions<P>) {
    this.opts = opts;
  }

  /** A request is on the wire. */
  get busy(): boolean {
    return this.inFlight;
  }

  /** Something submitted is not confirmed yet. */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  /**
   * A submit (the learner's, or one restored from the device). Returns false
   * when a request is already in flight: the payload then waits for the next
   * try instead of starting a second request.
   */
  submit(payload: P): boolean {
    this.pending = payload;
    if (this.inFlight || this.paused) return false;
    void this.run(payload);
    return true;
  }

  /** Try the waiting payload now (back online, page visible again, timer). */
  retryNow(): void {
    if (this.paused || this.inFlight || this.pending === null) return;
    void this.run(this.pending);
  }

  /** Stop automatic tries (End Exam takes over, or the page went away). */
  pause(): void {
    this.paused = true;
    this.cancelTimer();
  }

  /** Allow tries again, and try at once if something is waiting. */
  resume(): void {
    this.paused = false;
    this.retryNow();
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    (this.opts.cancel ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>)))(
      this.timer,
    );
    this.timer = null;
  }

  private async run(payload: P): Promise<void> {
    this.cancelTimer();
    this.inFlight = true;
    let outcome: SubmitOutcome;
    try {
      outcome = await this.opts.attempt(payload);
    } catch {
      outcome = { kind: 'rejected' };
    }
    this.inFlight = false;
    const streak = isRetryable(outcome) ? this.failures + 1 : this.failures;
    if (isRetryable(outcome)) {
      this.failures += 1;
      // A newer submit made while this one was in flight is what goes next.
      if (this.pending === null) this.pending = payload;
      if (!this.paused) {
        const schedule = this.opts.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
        this.timer = schedule(
          () => {
            this.timer = null;
            this.retryNow();
          },
          retryDelayMs(this.failures, this.opts.delays),
        );
      }
    } else {
      // Sent, held, or refused: nothing is left to send by itself.
      this.pending = null;
      this.failures = 0;
    }
    this.opts.onSettled?.(outcome, payload, streak);
  }
}
