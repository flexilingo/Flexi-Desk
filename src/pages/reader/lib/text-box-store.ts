import type { ReaderMarkKind, ReaderTextBox } from '../types';

/**
 * What the learner has written on the pages of one document.
 *
 * AN EXTERNAL STORE, NOT REACT STATE, and for a measurable reason: the reader
 * renders every page of the book, and none of them is memoised. Held in the
 * screen's state, one keystroke would re-render all 193 pages. Here, each page
 * subscribes to ITS OWN boxes (`useSyncExternalStore`) and only the page being
 * written on re-renders.
 *
 * The local database is written to behind the typing, never in front of it: a change
 * is shown at once and saved after a short pause, one request at a time per
 * box, so a slow network can reorder nothing and an answer is never replaced
 * by an older copy of itself.
 */

export interface TextBox {
  /** Stable for the box's whole life — including before the database has given it an id. */
  key: string;
  page: number;
  body: string;
  /** Top-left corner and width, as percentages of the page box. */
  x: number;
  y: number;
  w: number;
  /** Text size as a percentage of the page's width, so it scales with the page. */
  size: number;
  color: TextColor;
  bold: boolean;
  /** Drawn on white, so the book's print does not show through the answer. */
  background: boolean;
  /** Just placed by the reader, so it should take the cursor. */
  fresh: boolean;
  /** The last save did not reach the database. Shown on the box, with a retry. */
  failed: boolean;
}

/** The four preset inks, as palette names. The component maps each to a class. */
export const PRESET_COLORS = ['terra', 'ink', 'olive', 'danger'] as const;
export type PresetColor = (typeof PRESET_COLORS)[number];

/**
 * A preset name, or the learner's own `#rrggbb`.
 *
 * A hex value is THEIR content, not our chrome — someone marking corrections in
 * their own blue is not a design decision to overrule. Its shape is checked
 * here, in the handler and in the table, because it is rendered as a colour.
 */
export type TextColor = PresetColor | string;

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isPresetColor = (color: string): color is PresetColor =>
  (PRESET_COLORS as readonly string[]).includes(color);
export const isValidColor = (color: string): boolean => isPresetColor(color) || HEX.test(color);

/** How many of the learner's own inks the bar keeps within reach. */
const MAX_RECENT_COLORS = 5;

/** Where a new box goes. Its size comes from the blank it sits on, or from the pen. */
export type TextBoxShape = Pick<TextBox, 'x' | 'y' | 'w'> & { size?: number };

/** What a click or drag on the page makes: a text box, or one of the marks. */
export type WriteTool = 'text' | ReaderMarkKind;

/** What the editor bar shows and changes: the pen, and the box it is writing in. */
export interface PenState {
  /** Text by default. The marks share the pen's ink and size. */
  tool: WriteTool;
  size: number;
  color: TextColor;
  bold: boolean;
  background: boolean;
  /** The box the bar's changes apply to — the last one touched, not the focused one. */
  active: string | null;
  /** The learner's own inks, most recent first. */
  recent: TextColor[];
}

/** The sizes A− and A+ step through, as % of page width. */
export const TEXT_SIZES = [0.8, 1, 1.2, 1.4, 1.6, 1.9, 2.2, 2.6, 3, 3.6] as const;

export interface TextBoxRemote {
  /** Resolves to the box's stored id. */
  save: (box: {
    id?: string;
    page: number;
    body: string;
    x: number;
    y: number;
    w: number;
    font_size: number;
    color: TextColor;
    bold: boolean;
    background: boolean;
  }) => Promise<string>;
  remove: (id: string) => Promise<void>;
}

/** Long enough that a word is one save, short enough that closing the tab loses nothing typed. */
const SAVE_DELAY_MS = 600;

const EMPTY: TextBox[] = [];

const round2 = (n: number) => Math.round(n * 100) / 100;

export class TextBoxStore {
  private boxes = new Map<string, TextBox>();
  /** Server ids, by key — set the moment a new box is first stored. */
  private ids = new Map<string, string>();
  /** One cached array per page, so a page that did not change gets the same snapshot back. */
  private snapshots = new Map<number, TextBox[]>();
  private listeners = new Map<number, Set<() => void>>();
  /** Everything written in the document, for the list panel. */
  private all: TextBox[] = EMPTY;
  private allListeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Each box's requests, one after another. */
  private chains = new Map<string, Promise<void>>();
  private remote: TextBoxRemote | null = null;
  private loaded = false;
  private pen: PenState = {
    tool: 'text',
    size: 1.6,
    color: 'terra',
    bold: false,
    background: false,
    active: null,
    recent: [],
  };
  private penListeners = new Set<() => void>();

  connect(remote: TextBoxRemote): void {
    this.remote = remote;
  }

  /**
   * Take the stored boxes — once. From then on this store is the truth, so a
   * refetch after a reconnect cannot pull text out from under someone typing.
   */
  load(rows: ReaderTextBox[]): void {
    if (this.loaded) return;
    this.loaded = true;
    const pages = new Set<number>();
    for (const row of rows) {
      this.ids.set(row.id, row.id);
      this.boxes.set(row.id, {
        key: row.id,
        page: row.page_number,
        body: row.body,
        x: Number(row.x),
        y: Number(row.y),
        w: Number(row.w),
        size: Number(row.font_size),
        color: isValidColor(row.color) ? row.color : 'terra',
        bold: Boolean(row.bold),
        background: Boolean(row.background),
        fresh: false,
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

  snapshot(page: number): TextBox[] {
    return this.snapshots.get(page) ?? EMPTY;
  }

  /** Every box in the document, in reading order: by page, then down the page. */
  subscribeAll(listener: () => void): () => void {
    this.allListeners.add(listener);
    return () => this.allListeners.delete(listener);
  }

  allBoxes(): TextBox[] {
    return this.all;
  }

  /** Place a new, empty box, written with the current pen. Nothing is stored until it has text. */
  create(page: number, shape: TextBoxShape): string {
    const key = `new-${crypto.randomUUID()}`;
    const { color, bold, background } = this.pen;
    this.boxes.set(key, {
      key,
      page,
      body: '',
      x: shape.x,
      y: shape.y,
      w: shape.w,
      size: shape.size ?? this.pen.size,
      color,
      bold,
      background,
      fresh: true,
      failed: false,
    });
    this.refresh(page);
    // The bar points at what was just placed, before the cursor arrives in it.
    this.setPen({ active: key });
    return key;
  }

  // ── The pen ────────────────────────────────────────────────────────────────

  subscribePen(listener: () => void): () => void {
    this.penListeners.add(listener);
    return () => this.penListeners.delete(listener);
  }

  penSnapshot(): PenState {
    return this.pen;
  }

  /**
   * The box the bar is pointed at.
   *
   * STICKY on purpose. Opening the settings popover takes focus off the
   * textarea, so clearing this on blur would send every change from the popover
   * to nothing at all. It is replaced when another box is touched, and cleared
   * when the box goes away or writing ends.
   */
  setActive(key: string | null): void {
    if (this.pen.active === key) return;
    const box = key ? this.boxes.get(key) : undefined;
    // Stepping into a box picks up its pen, so the bar shows what is there.
    this.setPen(
      box
        ? {
            active: key,
            size: box.size,
            color: box.color,
            bold: box.bold,
            background: box.background,
          }
        : { active: null },
    );
  }

  /**
   * Change the pen. Applied to the box being written in, and kept for the next
   * one — the way a real pen stays the colour you last picked.
   *
   * `remember: false` is for a colour still being CHOSEN. The system colour
   * picker reports every shade the cursor passes over, and remembering each one
   * filled the bar with a row of near-identical reds. Those shades are shown on
   * the page as they happen and only the committed colour is kept.
   */
  style(
    patch: Partial<Pick<TextBox, 'size' | 'color' | 'bold' | 'background'>>,
    { remember = true } = {},
  ): void {
    if (patch.color !== undefined && !isValidColor(patch.color)) return;
    const keep = remember && patch.color !== undefined && !isPresetColor(patch.color);
    const recent = keep
      ? [
          patch.color as TextColor,
          ...this.pen.recent.filter((color) => color !== patch.color),
        ].slice(0, MAX_RECENT_COLORS)
      : this.pen.recent;
    this.setPen({ ...patch, recent });
    if (this.pen.active) this.update(this.pen.active, patch);
  }

  /** Pick up another tool. The box being written in is finished — the next click makes something else. */
  setTool(tool: WriteTool): void {
    if (this.pen.tool === tool) return;
    this.setPen({ tool, active: null });
  }

  private setPen(patch: Partial<PenState>): void {
    this.pen = { ...this.pen, ...patch };
    for (const listener of this.penListeners) listener();
  }

  // ── Boxes ──────────────────────────────────────────────────────────────────

  update(
    key: string,
    patch: Partial<
      Pick<TextBox, 'body' | 'x' | 'y' | 'w' | 'size' | 'color' | 'bold' | 'background'>
    >,
  ): void {
    const box = this.boxes.get(key);
    if (!box) return;
    this.boxes.set(key, { ...box, ...patch, fresh: false });
    this.refresh(box.page);
    this.schedule(key);
  }

  remove(key: string): void {
    const box = this.boxes.get(key);
    if (!box) return;
    if (this.pen.active === key) this.setPen({ active: null });
    this.clearTimer(key);
    this.boxes.delete(key);
    this.refresh(box.page);
    // Queued behind any save still in flight, so a box created a moment ago
    // has its id by the time it is deleted.
    this.enqueue(key, async () => {
      const id = this.ids.get(key);
      if (!id || !this.remote) return;
      try {
        await this.remote.remove(id);
        this.ids.delete(key);
      } catch {
        // Put it back and say so: a box that vanished here but survives on the
        // database copy would reappear on the next visit with no explanation.
        this.boxes.set(key, { ...box, failed: true });
        this.refresh(box.page);
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
    const box = this.boxes.get(key);
    if (!box) return;
    const id = this.ids.get(key);
    // An empty box that was never stored stays unstored.
    if (!id && !box.body.trim()) return;

    try {
      if (!this.remote) throw new Error('text boxes are not connected');
      const saved = await this.remote.save({
        id,
        page: box.page,
        body: box.body,
        x: round2(box.x),
        y: round2(box.y),
        w: round2(box.w),
        font_size: round2(box.size),
        color: box.color,
        bold: box.bold,
        background: box.background,
      });
      if (!id) this.ids.set(key, saved);
      this.setFailed(key, false);
    } catch {
      this.setFailed(key, true);
    }
  }

  private setFailed(key: string, failed: boolean): void {
    const box = this.boxes.get(key);
    if (!box || box.failed === failed) return;
    this.boxes.set(key, { ...box, failed });
    this.refresh(box.page);
  }

  private refresh(page: number): void {
    const list: TextBox[] = [];
    for (const box of this.boxes.values()) if (box.page === page) list.push(box);
    this.snapshots.set(page, list.length ? list : EMPTY);
    for (const listener of this.listeners.get(page) ?? []) listener();

    // The list panel shows the whole document, so it is rebuilt here rather
    // than kept as a second copy that could drift from the pages.
    const all = [...this.boxes.values()].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
    this.all = all.length ? all : EMPTY;
    for (const listener of this.allListeners) listener();
  }
}
