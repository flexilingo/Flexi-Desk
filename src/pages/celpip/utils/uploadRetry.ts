/**
 * Retrying a speaking answer's upload when the connection drops.
 *
 * Ported from flexi-lingo-front `utils/uploadRetry.ts`. A recording whose upload
 * never reached storage is retried a few times by itself, after a pause and after
 * waiting for the computer to report it is online again. Anything else (storage
 * refused the file, no session) fails at once.
 */

const NETWORK_MESSAGES =
  /failed to fetch|(?<![a-z])load failed|networkerror|network request failed|error sending request|dns error|connection (?:refused|reset|closed|error)|timed out|timeout|the internet connection appears to be offline|err_network|err_internet_disconnected|offline/i;

/** True for a failure where the request most likely never got an answer. */
export function isNetworkUploadError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: unknown; message?: unknown };
  const text =
    typeof err === 'string'
      ? err
      : [e.name, e.message].filter((v): v is string => typeof v === 'string').join(' ');
  return NETWORK_MESSAGES.test(text);
}

export interface RetryOptions {
  /** Pauses before each retry, in ms; their count is the number of retries. */
  delays?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  /** Resolves when the computer is online again (or at once if it is). */
  waitOnline?: () => Promise<void>;
  onRetry?: (attempt: number, err: unknown) => void;
}

export const DEFAULT_UPLOAD_RETRY_DELAYS = [2_000, 5_000, 10_000] as const;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Online now, or the 'online' event - never longer than `maxMs`. */
export function waitUntilOnline(maxMs = 30_000): Promise<void> {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    navigator.onLine !== false
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('online', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    window.addEventListener('online', done);
  });
}

/** Run `attempt`, retrying network failures after the given pauses. */
export async function withUploadRetry<T>(
  attempt: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const delays = opts.delays ?? DEFAULT_UPLOAD_RETRY_DELAYS;
  const sleep = opts.sleep ?? defaultSleep;
  const waitOnline = opts.waitOnline ?? (() => waitUntilOnline());
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (i >= delays.length || !isNetworkUploadError(err)) throw err;
      opts.onRetry?.(i + 1, err);
      await sleep(delays[i]);
      await waitOnline();
    }
  }
}
