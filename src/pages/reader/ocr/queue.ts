/**
 * Which scanned page the OCR reads next.
 *
 * The page being read comes FIRST, so the page in front of the reader answers
 * soonest. After it, the pages after it in order, then the ones before it.
 * A page that is done, in flight or failed this run is never handed out again
 * (a failure waits for an explicit `retry`). Pure — no timers, no DOM.
 */
export class OcrQueue {
  private known = new Set<number>();
  private done = new Set<number>();
  private failed = new Set<number>();
  private inFlight = new Set<number>();
  private current: number | null = null;

  /** Pages already read in an earlier sitting. They are scans, and finished. */
  resume(donePages: Iterable<number>, failedPages: Iterable<number> = []): void {
    for (const page of donePages) {
      this.known.add(page);
      this.done.add(page);
    }
    // A failure from an earlier sitting is tried again: nothing else would ever read it.
    for (const page of failedPages) {
      this.known.add(page);
      this.failed.delete(page);
    }
  }

  markScan(page: number): void {
    this.known.add(page);
  }
  setCurrent(page: number | null): void {
    this.current = page;
  }
  markStarted(page: number): void {
    this.inFlight.add(page);
  }
  markDone(page: number): void {
    this.inFlight.delete(page);
    this.failed.delete(page);
    this.done.add(page);
  }
  markFailed(page: number): void {
    this.inFlight.delete(page);
    this.failed.add(page);
  }
  /** Give the failed pages another go. */
  retry(): number[] {
    const pages = [...this.failed].sort((a, b) => a - b);
    this.failed.clear();
    return pages;
  }

  get currentPage(): number | null {
    return this.current;
  }
  get doneCount(): number {
    return this.done.size;
  }
  get totalKnown(): number {
    return this.known.size;
  }
  get failedCount(): number {
    return this.failed.size;
  }
  get busy(): boolean {
    return this.inFlight.size > 0;
  }
  isDone(page: number): boolean {
    return this.done.has(page);
  }
  isKnown(page: number): boolean {
    return this.known.has(page);
  }

  private wanted(page: number): boolean {
    return (
      this.known.has(page) &&
      !this.done.has(page) &&
      !this.failed.has(page) &&
      !this.inFlight.has(page)
    );
  }

  /** The next page to read, or null when nothing is waiting. */
  next(): number | null {
    if (this.current !== null && this.wanted(this.current)) return this.current;
    const pages = [...this.known].filter((p) => this.wanted(p)).sort((a, b) => a - b);
    if (!pages.length) return null;
    const from = this.current ?? 0;
    return pages.find((p) => p > from) ?? pages[0];
  }
}
