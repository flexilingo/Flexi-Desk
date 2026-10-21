import {
  MIN_ALNUM_PER_PAGE,
  countAlphanumerics,
  countOwnAlphanumerics,
} from '../lib/ocr-text-content';

/** The pdf.js operators that paint a raster image — what a scanned page is made of. */
export function paintsImage(ops: Record<string, number>, fnArray: ArrayLike<number>): boolean {
  const images = new Set([
    ops.paintImageXObject,
    ops.paintInlineImageXObject,
    ops.paintImageXObjectRepeat,
    ops.paintInlineImageXObjectGroup,
    ops.paintImageMaskXObject,
    ops.paintImageMaskXObjectGroup,
    ops.paintImageMaskXObjectRepeat,
  ]);
  for (let i = 0; i < fnArray.length; i += 1) if (images.has(fnArray[i])) return true;
  return false;
}

/**
 * The text-only half of the decision: does this page's own text fall below the
 * threshold, once the document's repeated boilerplate (a watermark, a running
 * header) is set aside? Same rule as the website's page view.
 */
export function hasTooLittleText(
  own: readonly string[],
  boilerplate: ReadonlySet<string>,
): boolean {
  if (countAlphanumerics(own) < MIN_ALNUM_PER_PAGE) return true;
  return countOwnAlphanumerics(own, boilerplate) < MIN_ALNUM_PER_PAGE;
}

/** A scan: almost no text of its own AND the page paints an image (a blank page never asks for OCR). */
export function isScanPage(
  own: readonly string[],
  boilerplate: ReadonlySet<string>,
  paintsAnImage: boolean,
): boolean {
  return hasTooLittleText(own, boilerplate) && paintsAnImage;
}
