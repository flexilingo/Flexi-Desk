import type { ReaderMark, ReaderMarkKind } from '../types';
import { isValidColor, type TextColor } from './text-box-store';

/**
 * The arrows, boxes and stamps drawn on the pages of one document.
 *
 * The same shape of store as `TextBoxStore`, for the same reasons: an external
 * store so that drawing on page 40 re-renders page 40 and nothing else, and a
 * database written BEHIND the drawing, one request at a time per mark, so a slow
 * network can reorder nothing.
 *
 * A mark is saved when it is let go of, never while it is moving — a drag is
 * sixty positions a second and only the last one is the mark.
 */

export type MarkKind = ReaderMarkKind;

/** The kinds placed with a click rather than dragged out. */
export const STAMP_KINDS = ['check', 'cross', 'question', 'star'] as const;
export const isStampKind = (kind: MarkKind): boolean =>
  (STAMP_KINDS as readonly string[]).includes(kind);

export interface Mark {
  /** Stable for the mark's whole life — including before the database has given it an id. */
  key: string;
  page: number;
  kind: MarkKind;
  /** Percentages of the page box: an arrow's tail and head, a box's corners, a stamp's centre. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** A share of the page's width: a stamp's height, and the weight of a line. */
  size: number;
  color: TextColor;
  /** The last save did not reach the database. */
  failed: boolean;
}

export type MarkShape = Pick<Mark, 'kind' | 'x1' | 'y1' | 'x2' | 'y2' | 'size' | 'color'>;
type MarkPatch = Partial<Pick<Mark, 'x1' | 'y1' | 'x2' | 'y2' | 'size' | 'color'>>;

export interface MarkRemote {
  /** Resolves to the mark's stored id. */
  save: (mark: {
    id?: string;
    page: number;
    kind: MarkKind;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    size: number;
    color: TextColor;
  }) => Promise<string>;
  remove: (id: string) => Promise<void>;
}

/** A restyle from the bar is a click or two; a short pause makes a burst of them one save. */
const SAVE_DELAY_MS = 400;

const EMPTY: Mark[] = [];
const round2 = (n: number) => Math.round(n * 100) / 100;
const clampPct = (n: number) => Math.min(100, Math.max(0, n));

export class MarkStore {
  private marks = new Map<string, Mark>();
  private ids = new Map<string, string>();
  private snapshots = new Map<number, Mark[]>();
  private listeners = new Map<number, Set<() => void>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private chains = new Map<string, Promise<void>>();
  private remote: MarkRemote | null = null;
  private loaded = false;
  private active: string | null = null;
  private activeListeners = new Set<() => void>();

  connect(remote: MarkRemote): void {
    this.remote = remote;
  }

  /** Take the stored marks — once. From then on this store is the truth. */
  load(rows: ReaderMark[]): void {
    if (this.loaded) return;
    this.loaded = true;
    const pages = new Set<number>();
    for (const row of rows) {
      this.ids.set(row.id, row.id);
      this.marks.set(row.id, {
        key: row.id,
        page: row.page_number,
        kind: row.kind,
        x1: Number(row.x1),
        y1: Number(row.y1),
        x2: Number(row.x2),
        y2: Number(row.y2),
        size: Number(row.size),
        color: isValidColor(row.color) ? row.color : 'terra',
        failed: false,
      });
      pages.add(row.page_number);
    }
    for (const page of pages) this.refresh(page);
  }

  subscribe(page: number, listener: () => void): () => void {
    let set = this.listeners.get(page);
    if (!set) {
      set = new Set();
      this.listeners.set(page, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  snapshot(page: number): Mark[] {
    return this.snapshots.get(page) ?? EMPTY;
  }

  get(key: string): Mark | undefined {
    return this.marks.get(key);
  }

  // ── The selected mark ──────────────────────────────────────────────────────

  subscribeActive(listener: () => void): () => void {
    this.activeListeners.add(listener);
    return () => this.activeListeners.delete(listener);
  }

  activeSnapshot(): string | null {
    return this.active;
  }

  setActive(key: string | null): void {
    if (this.active === key) return;
    this.active = key;
    for (const listener of this.activeListeners) listener();
  }

  // ── Marks ──────────────────────────────────────────────────────────────────

  /** Draw a new mark and select it. Saved at once — it is finished the moment it exists. */
  create(page: number, shape: MarkShape): string {
    const key = `new-${crypto.randomUUID()}`;
    this.marks.set(key, {
      key,
      page,
      ...shape,
      x1: clampPct(shape.x1),
      y1: clampPct(shape.y1),
      x2: clampPct(shape.x2),
      y2: clampPct(shape.y2),
      failed: false,
    });
    this.refresh(page);
    this.setActive(key);
    this.schedule(key, 0);
    return key;
  }

  /**
   * Change a mark. `save: false` is for a mark still under the pointer — it is
   * shown moving at once, and `commit` saves it once it is let go.
   */
  update(key: string, patch: MarkPatch, { save = true } = {}): void {
    const mark = this.marks.get(key);
    if (!mark) return;
    const next = { ...mark, ...patch };
    for (const axis of ['x1', 'y1', 'x2', 'y2'] as const) next[axis] = clampPct(next[axis]);
    this.marks.set(key, next);
    this.refresh(mark.page);
    if (save) this.schedule(key);
  }

  commit(key: string): void {
    this.schedule(key, 0);
  }

  /** The editor bar's ink and size, applied to the selected mark. */
  styleActive(patch: Pick<MarkPatch, 'size' | 'color'>): void {
    if (!this.active) return;
    if (patch.color !== undefined && !isValidColor(patch.color)) return;
    // Only what was actually given — an `undefined` must not overwrite the mark's own value.
    const given: MarkPatch = {};
    if (patch.size !== undefined) given.size = patch.size;
    if (patch.color !== undefined) given.color = patch.color;
    this.update(this.active, given);
  }

  remove(key: string): void {
    const mark = this.marks.get(key);
    if (!mark) return;
    if (this.active === key) this.setActive(null);
    this.clearTimer(key);
    this.marks.delete(key);
    this.refresh(mark.page);
    // Queued behind any save still in flight, so a mark drawn a moment ago has
    // its id by the time it is deleted.
    this.enqueue(key, async () => {
      const id = this.ids.get(key);
      if (!id || !this.remote) return;
      try {
        await this.remote.remove(id);
        this.ids.delete(key);
      } catch {
        // Put it back and say so, rather than let it reappear on the next visit.
        this.marks.set(key, { ...mark, failed: true });
        this.refresh(mark.page);
      }
    });
  }

  retry(key: string): void {
    this.schedule(key, 0);
  }

  /** Leaving the document: anything still waiting for its pause is saved now. */
  flushAll(): void {
    for (const key of [...this.timers.keys()]) {
      this.clearTimer(key);
      this.enqueue(key, () => this.save(key));
    }
  }

  private schedule(key: string, delay = SAVE_DELAY_MS): void {
    this.clearTimer(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.enqueue(key, () => this.save(key));
      }, delay),
    );
  }

  private clearTimer(key: string): void {
    const timer = this.timers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(key);
  }

  private enqueue(key: string, job: () => Promise<void>): void {
    const previous = this.chains.get(key) ?? Promise.resolve();
    // Jobs catch their own failures, so the chain itself never rejects.
    this.chains.set(key, previous.then(job));
  }

  private async save(key: string): Promise<void> {
    const mark = this.marks.get(key);
    if (!mark) return;
    const id = this.ids.get(key);
    try {
      if (!this.remote) throw new Error('marks are not connected');
      const saved = await this.remote.save({
        id,
        page: mark.page,
        kind: mark.kind,
        x1: round2(mark.x1),
        y1: round2(mark.y1),
        x2: round2(mark.x2),
        y2: round2(mark.y2),
        size: round2(mark.size),
        color: mark.color,
      });
      if (!id) this.ids.set(key, saved);
      this.setFailed(key, false);
    } catch {
      this.setFailed(key, true);
    }
  }

  private setFailed(key: string, failed: boolean): void {
    const mark = this.marks.get(key);
    if (!mark || mark.failed === failed) return;
    this.marks.set(key, { ...mark, failed });
    this.refresh(mark.page);
  }

  private refresh(page: number): void {
    const list: Mark[] = [];
    for (const mark of this.marks.values()) if (mark.page === page) list.push(mark);
    this.snapshots.set(page, list.length ? list : EMPTY);
    for (const listener of this.listeners.get(page) ?? []) listener();
  }
}
