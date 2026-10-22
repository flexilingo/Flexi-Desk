import { createWorker, type Worker as TessWorker } from 'tesseract.js';
import type { OcrWords } from '../types';
import { layoutFromBlocks, type TessBlock } from './layout';

/**
 * The OCR engine: tesseract.js running in the webview, on this computer.
 *
 * Everything that is code is local — the worker script and the WASM cores are
 * static files in `public/tesseract/` (see `scripts/sync-tesseract.mjs`). The
 * one thing fetched is a language's trained data, ONCE: tesseract.js keeps it
 * in IndexedDB, so every later start (and every start offline) reads it from
 * there. English and French are the exception: their data ships inside the app
 * (`public/tesseract/lang/`), so the very first scan needs no network at all.
 *
 * LANGUAGE DATA: tessdata `4.0.0_best_int`, from jsDelivr's GitHub mirror,
 * pinned to a commit. best_int is the integer-quantised "best" model — within a
 * hair of full best in accuracy at roughly fast-model size and speed, and the
 * set tesseract.js itself defaults to for the LSTM-only engine.
 */
export const TESSDATA_COMMIT = '806cd9a';
export const LANG_PATH = `https://cdn.jsdelivr.net/gh/naptha/tessdata@${TESSDATA_COMMIT}/4.0.0_best_int`;

/** Where the bundled English and French data lives (same origin, so no network). */
export const BUNDLED_LANG_PATH = '/tesseract/lang';
/** The languages shipped inside the app; keep in step with `scripts/sync-tesseract.mjs`. */
export const BUNDLED_LANGUAGES: readonly string[] = ['eng', 'fra'];

/** The bundled copy first; the CDN only for a language the app does not ship. */
export function langPathFor(language: string): string {
  return BUNDLED_LANGUAGES.includes(language) ? BUNDLED_LANG_PATH : LANG_PATH;
}

/** Served from the app's own origin. Relative, so it holds under any base path. */
export const WORKER_PATH = '/tesseract/worker.min.js';
/** A directory: tesseract.js picks the plain, SIMD or relaxed-SIMD LSTM core the CPU supports. */
export const CORE_PATH = '/tesseract/';

/** `loadingLanguage`: the language data is being downloaded (first use only), 0..1. */
export interface EngineStatus {
  loadingLanguage: boolean;
  progress: number;
}

export interface OcrEngine {
  /** How many pages can be read at once. */
  readonly size: number;
  /** Read one rendered page with worker `slot`. */
  recognize(image: HTMLCanvasElement, slot: number): Promise<OcrWords>;
  terminate(): Promise<void>;
}

export async function createOcrEngine(options: {
  language: string;
  workers: number;
  onStatus?: (status: EngineStatus) => void;
  isCancelled?: () => boolean;
}): Promise<OcrEngine> {
  const { language, onStatus } = options;
  const pool: TessWorker[] = [];

  const open = () =>
    createWorker(language, 1 /* OEM.LSTM_ONLY */, {
      workerPath: WORKER_PATH,
      corePath: CORE_PATH,
      langPath: langPathFor(language),
      // A blob worker would run under the page's CSP and could not importScripts the core.
      workerBlobURL: false,
      gzip: true,
      logger: (m) => {
        if (m.status === 'loading language traineddata') {
          onStatus?.({ loadingLanguage: m.progress < 1, progress: m.progress });
        }
      },
    });

  try {
    // The first worker fills the cache; the others then read it from there.
    pool.push(await open());
    if (options.isCancelled?.()) throw new Error('cancelled');
    for (let i = 1; i < options.workers; i += 1) pool.push(await open());
  } catch (cause) {
    await Promise.allSettled(pool.map((w) => w.terminate()));
    throw cause;
  }
  onStatus?.({ loadingLanguage: false, progress: 1 });

  return {
    size: pool.length,
    async recognize(image, slot) {
      const worker = pool[slot % pool.length];
      const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
      return layoutFromBlocks(
        data.blocks as unknown as TessBlock[] | null,
        image.width,
        image.height,
      );
    },
    async terminate() {
      await Promise.allSettled(pool.map((w) => w.terminate()));
    },
  };
}

/** One worker, two when the machine has the cores for it (8+ logical). */
export function workerCount(hardwareConcurrency = navigator.hardwareConcurrency || 2): number {
  return hardwareConcurrency >= 8 ? 2 : 1;
}
