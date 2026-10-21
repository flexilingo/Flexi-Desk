import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TextBoxStore, isValidColor, type TextBoxRemote } from '@/pages/reader/lib/text-box-store';
import { MarkStore, type MarkRemote } from '@/pages/reader/lib/mark-store';
import type { ReaderMark, ReaderTextBox } from '@/pages/reader/types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Lets the chained promises of a store settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);

function boxRemote(over: Partial<TextBoxRemote> = {}) {
  let n = 0;
  const save = vi.fn(async () => `id-${++n}`);
  const remove = vi.fn(async () => {});
  return { save, remove, ...over } as TextBoxRemote & { save: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
}

describe('TextBoxStore', () => {
  it('validates colours: presets and #rrggbb only', () => {
    expect(isValidColor('terra')).toBe(true);
    expect(isValidColor('#12aBcd')).toBe(true);
    expect(isValidColor('red')).toBe(false);
    expect(isValidColor('#12345')).toBe(false);
    expect(isValidColor('url(x)')).toBe(false);
  });

  it('does not store an empty box, and stores one once it has text, after the pause', async () => {
    const remote = boxRemote();
    const store = new TextBoxStore();
    store.connect(remote);
    const key = store.create(2, { x: 10, y: 20, w: 12 });
    expect(store.snapshot(2)).toHaveLength(1);
    expect(store.snapshot(2)[0].fresh).toBe(true);
    store.update(key, { body: '   ' });
    await vi.advanceTimersByTimeAsync(700);
    expect(remote.save).not.toHaveBeenCalled();

    store.update(key, { body: 'answer' });
    await vi.advanceTimersByTimeAsync(500);
    expect(remote.save).not.toHaveBeenCalled(); // still inside the 600 ms pause
    await vi.advanceTimersByTimeAsync(200);
    expect(remote.save).toHaveBeenCalledTimes(1);
    expect(remote.save.mock.calls[0][0]).toMatchObject({ id: undefined, page: 2, body: 'answer', x: 10, y: 20, w: 12, font_size: 1.6 });
  });

  it('coalesces a burst of typing into one save, and updates (with the id) afterwards', async () => {
    const remote = boxRemote();
    const store = new TextBoxStore();
    store.connect(remote);
    const key = store.create(1, { x: 1, y: 2, w: 10 });
    for (const body of ['a', 'ab', 'abc']) {
      store.update(key, { body });
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(700);
    expect(remote.save).toHaveBeenCalledTimes(1);
    store.update(key, { body: 'abcd' });
    await vi.advanceTimersByTimeAsync(700);
    expect(remote.save).toHaveBeenCalledTimes(2);
    expect(remote.save.mock.calls[1][0].id).toBe('id-1');
  });

  it('rounds the stored numbers to 2 decimals', async () => {
    const remote = boxRemote();
    const store = new TextBoxStore();
    store.connect(remote);
    const key = store.create(1, { x: 1.23456, y: 2.34567, w: 10.9999, size: 1.111 });
    store.update(key, { body: 'x' });
    await vi.advanceTimersByTimeAsync(700);
    expect(remote.save.mock.calls[0][0]).toMatchObject({ x: 1.23, y: 2.35, w: 11, font_size: 1.11 });
  });

  it('marks a failed save and retries it on demand', async () => {
    const remote = boxRemote();
    remote.save.mockRejectedValueOnce(new Error('disk'));
    const store = new TextBoxStore();
    store.connect(remote);
    const key = store.create(1, { x: 1, y: 2, w: 10 });
    store.update(key, { body: 'text' });
    await vi.advanceTimersByTimeAsync(700);
    expect(store.snapshot(1)[0].failed).toBe(true);
    store.retry(key);
    await vi.advanceTimersByTimeAsync(10);
    expect(remote.save).toHaveBeenCalledTimes(2);
    expect(store.snapshot(1)[0].failed).toBe(false);
  });

  it('saves one request at a time per box, in order', async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const remote = boxRemote({
      save: vi.fn(async (b) => {
        order.push(`start:${b.body}`);
        if (b.body === 'one') await new Promise<void>((r) => (release = r));
        order.push(`end:${b.body}`);
        return 'id-1';
      }),
    });
    const store = new TextBoxStore();
    store.connect(remote);
    const key = store.create(1, { x: 1, y: 2, w: 10 });
    store.update(key, { body: 'one' });
    await vi.advanceTimersByTimeAsync(700);
    store.update(key, { body: 'two' });
    await vi.advanceTimersByTimeAsync(700);
    expect(order).toEqual(['start:one']); // the second waits for the first
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(order).toEqual(['start:one', 'end:one', 'start:two', 'end:two']);
  });

  it('flushAll saves what is still waiting for its pause', async () => {
    const remote = boxRemote();
    const store = new TextBoxStore();
    store.connect(remote);
    const key = store.create(1, { x: 1, y: 2, w: 10 });
    store.update(key, { body: 'unsaved' });
    store.flushAll();
    await settle();
    expect(remote.save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(remote.save).toHaveBeenCalledTimes(1); // the timer was cleared, no second save
  });

  it('removes a stored box behind its in-flight save, and restores it (failed) if the delete fails', async () => {
    const remote = boxRemote();
    const store = new TextBoxStore();
    store.connect(remote);
    const key = store.create(1, { x: 1, y: 2, w: 10 });
    store.update(key, { body: 'x' });
    await vi.advanceTimersByTimeAsync(700);
    remote.remove.mockRejectedValueOnce(new Error('locked'));
    store.remove(key);
    expect(store.snapshot(1)).toHaveLength(0);
    await settle();
    expect(remote.remove).toHaveBeenCalledWith('id-1');
    expect(store.snapshot(1)).toHaveLength(1);
    expect(store.snapshot(1)[0].failed).toBe(true);
  });

  it('never calls remove for a box that was never stored', async () => {
    const remote = boxRemote();
    const store = new TextBoxStore();
    store.connect(remote);
    const key = store.create(1, { x: 1, y: 2, w: 10 });
    store.remove(key);
    await settle();
    expect(remote.remove).not.toHaveBeenCalled();
  });

  it('loads stored rows once, falls back to terra for a bad colour, and sorts the list by page then position', () => {
    const store = new TextBoxStore();
    const row = (id: string, page: number, y: number, color: string): ReaderTextBox => ({
      id, page_number: page, body: id, x: 5, y, w: 10, font_size: 1.6, color, bold: true, background: true, updated_at: '',
    });
    store.load([row('b', 2, 5, '#00ff00'), row('a', 1, 50, 'nonsense'), row('c', 1, 10, 'ink')]);
    store.load([row('late', 9, 1, 'ink')]); // a second load is ignored
    expect(store.allBoxes().map((b) => b.key)).toEqual(['c', 'a', 'b']);
    expect(store.snapshot(1).find((b) => b.key === 'a')!.color).toBe('terra');
    expect(store.snapshot(2)[0].color).toBe('#00ff00');
  });

  it('keeps the pen: styling applies to the active box and is remembered for the next one', () => {
    const store = new TextBoxStore();
    store.connect(boxRemote());
    const first = store.create(1, { x: 1, y: 1, w: 10 });
    store.style({ color: '#112233', bold: true });
    expect(store.snapshot(1)[0]).toMatchObject({ color: '#112233', bold: true });
    store.create(1, { x: 5, y: 5, w: 10 });
    expect(store.snapshot(1).find((b) => b.key !== first)).toMatchObject({ color: '#112233', bold: true });
    store.style({ color: '#445566' }, { remember: false });
    expect(store.penSnapshot().recent).toEqual(['#112233']); // a shade still being chosen is not kept
    store.style({ color: 'not-a-colour' });
    expect(store.penSnapshot().color).toBe('#445566');
  });

  it('stepping into a box picks up its pen, and a tool change finishes the box', () => {
    const store = new TextBoxStore();
    store.connect(boxRemote());
    const key = store.create(1, { x: 1, y: 1, w: 10, size: 2.6 });
    store.setActive(null);
    store.setActive(key);
    expect(store.penSnapshot().size).toBe(2.6);
    store.setTool('arrow');
    expect(store.penSnapshot()).toMatchObject({ tool: 'arrow', active: null });
  });
});

function markRemote() {
  let n = 0;
  return {
    save: vi.fn(async (_m: Parameters<MarkRemote['save']>[0]) => `m-${++n}`),
    remove: vi.fn(async (_id: string) => {}),
  };
}
const shape = { kind: 'box' as const, x1: 10, y1: 10, x2: 40, y2: 30, size: 1.6, color: 'ink' };

describe('MarkStore', () => {
  it('saves a new mark at once and selects it', async () => {
    const remote = markRemote();
    const store = new MarkStore();
    store.connect(remote);
    const key = store.create(3, shape);
    expect(store.activeSnapshot()).toBe(key);
    await settle();
    expect(remote.save).toHaveBeenCalledTimes(1);
    expect(remote.save.mock.calls[0][0]).toMatchObject({ id: undefined, page: 3, kind: 'box', x2: 40 });
  });

  it('clamps coordinates into 0-100', () => {
    const store = new MarkStore();
    store.connect(markRemote());
    const key = store.create(1, { ...shape, x1: -5, y2: 140 });
    expect(store.get(key)).toMatchObject({ x1: 0, y2: 100 });
    store.update(key, { x2: 250 }, { save: false });
    expect(store.get(key)!.x2).toBe(100);
  });

  it('shows a drag at once but only saves on commit', async () => {
    const remote = markRemote();
    const store = new MarkStore();
    store.connect(remote);
    const key = store.create(1, shape);
    await settle();
    remote.save.mockClear();
    for (const x of [11, 12, 13]) store.update(key, { x1: x }, { save: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.save).not.toHaveBeenCalled();
    store.commit(key);
    await settle();
    expect(remote.save).toHaveBeenCalledTimes(1);
    expect(remote.save.mock.calls[0][0]).toMatchObject({ id: 'm-1', x1: 13 });
  });

  it('coalesces restyles inside the 400 ms pause, and ignores an invalid colour and undefined fields', async () => {
    const remote = markRemote();
    const store = new MarkStore();
    store.connect(remote);
    const key = store.create(1, shape);
    await settle();
    remote.save.mockClear();
    store.styleActive({ color: 'bad', size: undefined });
    store.styleActive({ size: 2.2 });
    store.styleActive({ color: '#abcdef' });
    await vi.advanceTimersByTimeAsync(300);
    expect(remote.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(remote.save).toHaveBeenCalledTimes(1);
    expect(store.get(key)).toMatchObject({ size: 2.2, color: '#abcdef' });
  });

  it('retries a failed save', async () => {
    const remote = markRemote();
    remote.save.mockRejectedValueOnce(new Error('disk'));
    const store = new MarkStore();
    store.connect(remote);
    const key = store.create(1, shape);
    await settle();
    expect(store.get(key)!.failed).toBe(true);
    store.retry(key);
    await settle();
    expect(store.get(key)!.failed).toBe(false);
    expect(remote.save).toHaveBeenCalledTimes(2);
  });

  it('flushAll saves a pending restyle; remove deselects, deletes by stored id, and restores on failure', async () => {
    const remote = markRemote();
    const store = new MarkStore();
    store.connect(remote);
    const key = store.create(1, shape);
    await settle();
    store.update(key, { x1: 20 }); // waiting for its pause
    store.flushAll();
    await settle();
    expect(remote.save).toHaveBeenCalledTimes(2);

    remote.remove.mockRejectedValueOnce(new Error('locked'));
    store.remove(key);
    expect(store.activeSnapshot()).toBeNull();
    expect(store.snapshot(1)).toHaveLength(0);
    await settle();
    expect(remote.remove).toHaveBeenCalledWith('m-1');
    expect(store.snapshot(1)[0]).toMatchObject({ key, failed: true });
  });

  it('loads stored rows once with a safe colour', () => {
    const store = new MarkStore();
    const row = (id: string, color: string): ReaderMark => ({
      id, page_number: 4, kind: 'arrow', x1: 1, y1: 2, x2: 3, y2: 4, size: 1.6, color, updated_at: '',
    });
    store.load([row('a', 'danger'), row('b', '<script>')]);
    store.load([row('c', 'ink')]);
    expect(store.snapshot(4).map((m) => m.key)).toEqual(['a', 'b']);
    expect(store.get('b')!.color).toBe('terra');
  });
});
