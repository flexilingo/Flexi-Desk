import type { PDFDocumentProxy } from 'pdfjs-dist';

/** The resolution OCR reads a page at: 99.3% of words right at 1.6 s/page, measured on the server. */
export const OCR_DPI = 200;
/** Ceiling on pixels, so a poster-sized page cannot allocate a gigabyte. */
export const MAX_OCR_PIXELS = 20_000_000;

/** CSS pixels per PDF unit for a page of this size, capped by `MAX_OCR_PIXELS`. */
export function ocrScale(widthPt: number, heightPt: number, dpi = OCR_DPI): number {
  const wanted = dpi / 72;
  const pixels = widthPt * heightPt * wanted * wanted;
  return pixels <= MAX_OCR_PIXELS ? wanted : Math.sqrt(MAX_OCR_PIXELS / (widthPt * heightPt));
}

/**
 * Draw one page to an offscreen canvas for OCR.
 *
 * `getViewport` uses the page's visible box and its /Rotate, exactly as the
 * reader's own view does, so the words' fractions land on the printed words at
 * any zoom. Painted on white: tesseract reads dark on light.
 */
export async function renderPageForOcr(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: ocrScale(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const task = page.render({ canvas, viewport, background: 'white' });
  try {
    await task.promise;
  } finally {
    page.cleanup();
  }
  return canvas;
}

/** Give the pixels back at once instead of waiting for the collector. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
