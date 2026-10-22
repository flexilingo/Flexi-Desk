/**
 * Wraps an async action so that while one call is in flight every further call is
 * ignored. `next-activity` consumes an item of the session queue on EVERY call, so
 * a second Continue / Enter press while the next card was loading used to fetch
 * another card and let the later answer replace the earlier one unseen — skipping
 * it. One card per Continue.
 */
export function singleFlight<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  let busy = false;
  const run = async (...args: A): Promise<boolean> => {
    if (busy) return false;
    busy = true;
    try {
      await fn(...args);
    } finally {
      busy = false;
    }
    return true;
  };
  run.isBusy = () => busy;
  return run;
}
