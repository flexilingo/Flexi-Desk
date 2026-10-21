/**
 * Lazy, browser-only access to pdf.js.
 *
 * Imported dynamically rather than at module scope because pdf.js touches
 * `document` and `DOMMatrix` while evaluating, so a static import turns any
 * file that reaches it into a client-only file transitively — including the
 * route's `page.tsx`, which Next then refuses to prerender.
 *
 * The promise is cached at module level so the ~1 MB bundle is fetched once per
 * tab no matter how many pages or documents are opened.
 *
 * DESK: the worker and the data files are static assets in `public/pdf-worker/`
 * (committed, refreshed by `scripts/sync-pdf-worker.mjs`), served from the app's
 * own origin. `worker-src blob:` and the wasm CSP entry are in `tauri.conf.json`.
 * The document itself arrives as an asset-protocol URL — see `getReaderFileUrl`.
 */

const ASSET_BASE = '/pdf-worker/';

let cached: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('pdf.js is browser-only'));
  }
  cached ??= import('pdfjs-dist').then((pdfjs) => {
    // Kept in sync with the bundled copy by `scripts/sync-pdf-worker.mjs`.
    pdfjs.GlobalWorkerOptions.workerSrc = `${ASSET_BASE}pdf.worker.min.mjs`;
    return pdfjs;
  });
  return cached;
}

/**
 * The data files pdf.js fetches on demand — see the sync script for why each
 * one matters. Spread into every `getDocument` call; omitting them does not
 * error, it silently degrades CJK text, unembedded fonts and scanned images.
 */
export const PDF_ASSET_OPTIONS = {
  cMapUrl: `${ASSET_BASE}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
  wasmUrl: `${ASSET_BASE}wasm/`,
  iccUrl: `${ASSET_BASE}iccs/`,
} as const;

/**
 * Release a document: its worker, the transferred file bytes, and every page's
 * parsed operator list.
 *
 * Goes through `loadingTask` because pdf.js v6 moved `destroy()` there —
 * `PDFDocumentProxy` no longer has one, so the obvious `pdf.destroy()` throws
 * a TypeError instead of freeing anything. Dropping the reference is NOT
 * enough on its own: the worker holds the document alive and survives the
 * navigation.
 */
export async function destroyDocument(
  pdf: import('pdfjs-dist').PDFDocumentProxy | null | undefined,
): Promise<void> {
  try {
    await pdf?.loadingTask?.destroy();
  } catch {
    // Already gone, or torn down mid-parse. Either way there is nothing to do.
  }
}
