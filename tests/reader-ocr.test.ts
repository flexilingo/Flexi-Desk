import { describe, expect, it, vi } from 'vitest';
import { ocrLanguageFor } from '@/pages/reader/ocr/languages';
import { layoutFromBlocks, type TessBlock } from '@/pages/reader/ocr/layout';
import { OcrQueue } from '@/pages/reader/ocr/queue';
import { hasTooLittleText, isScanPage, paintsImage } from '@/pages/reader/ocr/scan-detection';
import { ocrScale, MAX_OCR_PIXELS } from '@/pages/reader/ocr/render';
import { DocumentOcr, type OcrDeps } from '@/pages/reader/ocr/controller';
import { validateWords } from './helpers/ocr-words';

const w = (text: string, confidence: number, x0: number, y0: number, x1: number, y1: number) => ({
  text,
  confidence,
  bbox: { x0, y0, x1, y1 },
});

/** A 1000 x 2000 px page, shaped like tesseract.js' `data.blocks`. */
const FIXTURE: TessBlock[] = [
  {
    paragraphs: [
      {
        lines: [
          { words: [w('Main', 96, 100, 200, 300, 260), w('Street', 95, 320, 200, 520, 260), w('runs', 92, 540, 210, 700, 260)] },
          // A low-confidence line: only a long, confident word is rescued.
          { words: [w('xq', 20, 100, 300, 140, 340), w('market', 88, 160, 300, 400, 360), w('~~', 90, 420, 300, 470, 340)] },
        ],
      },
      {
        lines: [
          // Noise: empty text, zero-size box, no letters at all.
          { words: [w('  ', 99, 0, 0, 10, 10), w('flat', 99, 50, 50, 50, 90), w('---', 99, 60, 400, 120, 410)] },
          { words: [w('ﬁne', 90, 100, 500, 260, 560), w('old', 80, 280, 500, 380, 560)] },
        ],
      },
    ],
  },
];

describe('ocrLanguageFor', () => {
  it('maps the desk and tesseract languages', () => {
    const expected: Record<string, string> = {
      en: 'eng', fr: 'fra', es: 'spa', de: 'deu', it: 'ita', pt: 'por', ru: 'rus', ja: 'jpn',
      ko: 'kor', zh: 'chi_sim', ar: 'ara', fa: 'fas', hi: 'hin', tr: 'tur', vi: 'vie',
    };
    for (const [iso, code] of Object.entries(expected)) {
      expect(ocrLanguageFor(iso)).toEqual({ code, iso, fallback: false });
    }
  });
  it('normalises case and regions, and picks traditional Chinese', () => {
    expect(ocrLanguageFor('FR-CA').code).toBe('fra');
    expect(ocrLanguageFor('pt_BR').code).toBe('por');
    expect(ocrLanguageFor('zh-TW').code).toBe('chi_tra');
    expect(ocrLanguageFor('zh-Hans').code).toBe('chi_sim');
  });
  it('falls back to English, and says so, for anything unknown', () => {
    expect(ocrLanguageFor('xx')).toEqual({ code: 'eng', iso: 'xx', fallback: true });
    expect(ocrLanguageFor(null)).toEqual({ code: 'eng', iso: 'en', fallback: false });
    expect(ocrLanguageFor('')).toEqual({ code: 'eng', iso: 'en', fallback: false });
  });
});

describe('layoutFromBlocks', () => {
  const out = layoutFromBlocks(FIXTURE, 1000, 2000);

  it('has exactly the stored shape, with fractions inside the page', () => {
    expect(out.v).toBe(1);
    expect(validateWords(out)).toBe(true);
  });
  it('turns pixel boxes into 4-decimal page fractions', () => {
    expect(out.words[0]).toEqual(['Main', 0.1, 0.1, 0.3, 0.13, 0]);
    expect(out.words[1]).toEqual(['Street', 0.32, 0.1, 0.52, 0.13, 0]);
  });
  it('groups words into lines in reading order, with the union box per line', () => {
    expect(out.words.map((x) => [x[0], x[5]])).toEqual([
      ['Main', 0], ['Street', 0], ['runs', 0],
      ['market', 1],
      ['fine', 2], ['old', 2],
    ]);
    expect(out.lines[0]).toEqual([0.1, 0.1, 0.7, 0.13]);
    expect(out.lines).toHaveLength(3);
  });
  it('drops noise, rescues only confident words on a weak line, and applies NFKC', () => {
    const texts = out.words.map((x) => x[0]);
    expect(texts).not.toContain('xq');
    expect(texts).not.toContain('~~');
    expect(texts).not.toContain('flat');
    expect(texts).not.toContain('---');
    expect(texts).toContain('fine'); // the "fi" ligature, normalised
  });
  it('is empty for a page with no blocks or no size', () => {
    expect(layoutFromBlocks(null, 100, 100)).toEqual({ v: 1, lines: [], words: [] });
    expect(layoutFromBlocks(FIXTURE, 0, 0).words).toEqual([]);
  });
});

describe('ocrScale', () => {
  it('is 200 dpi for an ordinary page and capped for a huge one', () => {
    expect(ocrScale(612, 792)).toBeCloseTo(200 / 72, 5);
    const s = ocrScale(5000, 5000);
    expect(5000 * s * 5000 * s).toBeLessThanOrEqual(MAX_OCR_PIXELS + 1);
  });
});

describe('OcrQueue', () => {
  it('reads the current page first, then the pages after it, then the ones before', () => {
    const q = new OcrQueue();
    [2, 5, 9, 12].forEach((p) => q.markScan(p));
    q.setCurrent(9);
    const order: number[] = [];
    for (let p = q.next(); p !== null; p = q.next()) {
      order.push(p);
      q.markStarted(p);
      q.markDone(p);
    }
    expect(order).toEqual([9, 12, 2, 5]);
  });
  it('re-aims at a new current page, and never hands out a page twice', () => {
    const q = new OcrQueue();
    [1, 2, 3].forEach((p) => q.markScan(p));
    q.setCurrent(1);
    expect(q.next()).toBe(1);
    q.markStarted(1);
    expect(q.next()).toBe(2); // 1 is in flight
    q.setCurrent(3);
    expect(q.next()).toBe(3);
  });
  it('skips pages done in an earlier sitting (resume)', () => {
    const q = new OcrQueue();
    q.resume([1, 2, 3]);
    q.markScan(4);
    q.setCurrent(1);
    expect(q.doneCount).toBe(3);
    expect(q.next()).toBe(4);
  });
  it('holds a failed page back until retry', () => {
    const q = new OcrQueue();
    q.markScan(1);
    q.markScan(2);
    q.setCurrent(1);
    q.markStarted(1);
    q.markFailed(1);
    expect(q.next()).toBe(2);
    q.markStarted(2);
    q.markDone(2);
    expect(q.next()).toBeNull();
    expect(q.retry()).toEqual([1]);
    expect(q.next()).toBe(1);
  });
});

describe('scan detection', () => {
  const OPS = { paintImageXObject: 85, paintFormXObjectBegin: 74 } as Record<string, number>;
  const lorem = ['The old market square is on the left of the harbour.'];

  it('sees an image operator', () => {
    expect(paintsImage(OPS, [10, 85, 20])).toBe(true);
    expect(paintsImage(OPS, [10, 74])).toBe(false);
  });
  it('needs little text AND an image: a digital page, a blank page and a scan', () => {
    expect(isScanPage(lorem, new Set(), true)).toBe(false); // plenty of text
    expect(isScanPage([], new Set(), false)).toBe(false); // blank verso never asks
    expect(isScanPage(['12'], new Set(), true)).toBe(true); // a page number and a picture
  });
  it('does not count a watermark stamped on every page as the page\'s own text', () => {
    const mark = 'downloaded from example library';
    expect(hasTooLittleText([mark, '3'], new Set([mark]))).toBe(true);
    expect(isScanPage([mark, '3'], new Set([mark]), true)).toBe(true);
    expect(isScanPage([mark, ...lorem], new Set([mark]), true)).toBe(false);
  });
});

// ── the controller, driven with fakes ───────────────────────────────────────

function fakePdf(pages: Array<{ text: string[]; image: boolean }>) {
  return {
    numPages: pages.length,
    getPage: async (n: number) => ({
      getTextContent: async () => ({ items: pages[n - 1].text.map((str) => ({ str })) }),
      getOperatorList: async () => ({ fnArray: pages[n - 1].image ? [85] : [74] }),
      cleanup: () => {},
    }),
  } as never;
}

function setup(pages: Array<{ text: string[]; image: boolean }>, ready: number[] = [], failed: number[] = []) {
  const read: number[] = [];
  const saves: Array<{ page: number; failed: boolean }> = [];
  const states: Array<[string, number | undefined]> = [];
  const canvases = new Map<object, number>();
  const render = vi.fn(async (_pdf: unknown, page: number) => {
    const canvas = { width: 100, height: 100 } as HTMLCanvasElement;
    canvases.set(canvas, page);
    return canvas;
  });
  const failPages = new Set<number>();
  const deps: OcrDeps = {
    createEngine: vi.fn(async () => ({
      size: 1,
      recognize: async (canvas: HTMLCanvasElement) => {
        const page = canvases.get(canvas) as number;
        read.push(page);
        if (failPages.has(page)) throw new Error('boom');
        return { v: 1 as const, lines: [], words: [] };
      },
      terminate: async () => {},
    })),
    render,
    workers: 1,
    api: {
      summary: vi.fn(async () => ({
        state: { status: ready.length ? 'running' : null, pages_done: ready.length, pages_total: null, error_code: null, page: null, words: null },
        ready_pages: ready,
        failed_pages: failed,
      })) as never,
      save: vi.fn(async (body: { page: number; words?: unknown }) => {
        saves.push({ page: body.page, failed: !body.words });
        return {} as never;
      }) as never,
      setState: vi.fn(async (body: { status: string; pages_total?: number }) => {
        states.push([body.status, body.pages_total]);
        return {} as never;
      }) as never,
    },
    emit: vi.fn(),
  };
  const ocr = new DocumentOcr(fakePdf(pages), 'doc1', 'fr', Promise.resolve(new Set()), deps);
  return { ocr, read, saves, states, failPages, deps };
}

const waitFor = async (cond: () => boolean) => {
  for (let i = 0; i < 400 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 5));
  expect(cond()).toBe(true);
};

const SCANS = [
  { text: [], image: true },
  { text: ['A page of ordinary printed text with plenty of letters.'], image: false },
  { text: ['3'], image: true },
  { text: [], image: false },
  { text: [], image: true },
];

describe('DocumentOcr', () => {
  it('reads only scanned pages, the current one first, then finishes the layer', async () => {
    const { ocr, read, states } = setup(SCANS);
    ocr.setCurrentPage(5);
    await ocr.start();
    await waitFor(() => ocr.getState().status === 'ready');
    expect(read[0]).toBe(5);
    expect([...read].sort()).toEqual([1, 3, 5]);
    expect(ocr.getState()).toMatchObject({ done: 3, total: 3, phase: 'idle' });
    expect(states.at(-1)).toEqual(['ready', 3]);
    ocr.dispose();
  });
  it('resumes: pages done earlier are not read again', async () => {
    const { ocr, read } = setup(SCANS, [1, 3]);
    await ocr.start();
    await waitFor(() => ocr.getState().status === 'ready');
    expect(read).toEqual([5]);
    ocr.dispose();
  });
  it('stores a failed page as failed, ends failed, and Retry reads it again', async () => {
    const { ocr, read, saves, failPages } = setup(SCANS);
    failPages.add(3);
    await ocr.start();
    await waitFor(() => ocr.getState().status === 'failed');
    expect(saves.find((s) => s.page === 3)).toEqual({ page: 3, failed: true });
    expect(ocr.getState().errorCode).toBe('OCR_PAGE_FAILED');
    failPages.clear();
    ocr.retry();
    await waitFor(() => ocr.getState().status === 'ready');
    expect(read.filter((p) => p === 3)).toHaveLength(2);
    ocr.dispose();
  });
  it('does nothing for a document with no scanned page', async () => {
    const { ocr, read, deps } = setup([{ text: ['Plenty of ordinary printed words here, enough to count.'], image: false }]);
    await ocr.start();
    await new Promise((r) => setTimeout(r, 60));
    expect(read).toEqual([]);
    expect(deps.createEngine).not.toHaveBeenCalled();
    expect(ocr.getState().status).toBeNull();
    ocr.dispose();
  });
  it('stops cleanly on dispose', async () => {
    const { ocr, read } = setup(SCANS);
    await ocr.start();
    ocr.dispose();
    const seen = read.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(read.length).toBe(seen);
  });
});
