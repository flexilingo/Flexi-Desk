/**
 * A scanned page's OCR words, as a pdf.js text layer.
 *
 * pdf.js makes a page's words tappable from the PDF's own text, and a scan has
 * none — it is a photograph of print. The worker reads such a page with OCR and
 * stores every word WITH its box (`reader_pages.ocr_words`). This turns those
 * boxes into the `TextContent` object `pdfjs.TextLayer` already accepts in
 * place of a stream, so everything downstream — `decorateWords`, tap to look
 * up, tap to speak, highlights, selection, the line a word came from — sees
 * ordinary pdf.js runs and works unchanged.
 *
 * ONE ITEM PER WORD, each fitted to its own box. pdf.js stretches a run to its
 * `width` (`--scale-x`), so a word's span covers exactly the printed word
 * whatever font the browser draws it in. Letting pdf.js parse an OCR'd PDF
 * instead merges a line into one run drawn in a fallback font, and the tap
 * targets drift off the printed words as the line goes on.
 *
 * A `" "` item sits in the gap between two words and an empty `hasEOL` item
 * ends each line, which is the shape pdf.js itself produces: selecting a
 * phrase then reads "the old house", not "theoldhouse", and lines break.
 *
 * Pure — no DOM, no pdf.js import — so it runs under `node --test`.
 */

/** `reader_pages.ocr_words` — the one definition lives with the reader's other types. */
import type { OcrWords } from '../types';
export type { OcrWords };

/**
 * The part of a pdf.js `PageViewport` this needs.
 *
 * The OCR boxes are fractions of the page AS DISPLAYED — crop box, /Rotate
 * applied — which is exactly the viewport's own space, and `convertToPdfPoint`
 * carries a point from there back into PDF user space whatever the rotation.
 */
export interface ViewportLike {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): number[];
}

/** Structurally a pdf.js `TextItem`. */
export interface OcrTextItem {
  str: string;
  dir: 'ltr';
  transform: [number, number, number, number, number, number];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

/** Structurally a pdf.js `TextContent`. */
export interface OcrTextContent {
  items: OcrTextItem[];
  styles: Record<
    string,
    { ascent: number; descent: number; vertical: boolean; fontFamily: string }
  >;
  lang: string | null;
}

export const OCR_FONT_NAME = 'flexi-ocr';

/** pdf.js' fallback ascent ratio for a font it cannot measure. */
export const DEFAULT_ASCENT = 0.8;

/**
 * Past this much drift across its width, as a share of its height, a line is
 * treated as skewed: its words follow a fitted baseline instead of sharing the
 * line's axis-aligned box, which on a tilted scan is far taller than the text.
 */
const SKEW_DRIFT = 0.25;

/** Beyond ~6 degrees a fitted "skew" is noise, not a tilted page. */
const MAX_SLOPE = 0.1;

type Point = [number, number];

export interface BuiltOcrLayer {
  content: OcrTextContent;
  /**
   * The line each item belongs to, index-aligned with `content.items` (and so
   * with pdf.js' `textDivs`). The caller groups runs into lines with these
   * instead of each span's `top`: on a skewed or rotated page, words of one
   * line do not share a `top`.
   */
  lineOf: number[];
}

/**
 * Build the text layer for one scanned page.
 *
 * @param ocr      the page's `ocr_words`.
 * @param viewport the page's viewport, at any scale.
 * @param ascent   the ascent ratio pdf.js will use for `sans-serif` — the share
 *                 of a run's height above its baseline. pdf.js places a run's
 *                 top at `baseline - ascent * height`, so the baseline is put
 *                 exactly there below the word's top edge and the run lands on
 *                 the word however the browser's font measures.
 */
export function buildOcrTextContent(
  ocr: OcrWords | null | undefined,
  viewport: ViewportLike,
  ascent: number = DEFAULT_ASCENT,
): BuiltOcrLayer {
  const items: OcrTextItem[] = [];
  const lineOf: number[] = [];
  const content: OcrTextContent = {
    items,
    styles: {
      [OCR_FONT_NAME]: {
        fontFamily: 'sans-serif',
        ascent: DEFAULT_ASCENT,
        descent: DEFAULT_ASCENT - 1,
        vertical: false,
      },
    },
    lang: null,
  };
  if (!ocr?.words?.length) return { content, lineOf };

  const W = viewport.width;
  const H = viewport.height;
  const toPdf = ([x, y]: Point): Point => {
    const p = viewport.convertToPdfPoint(x, y);
    return [p[0], p[1]];
  };
  const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
  const length = (v: Point) => Math.hypot(v[0], v[1]);
  const lerp = (a: Point, b: Point, t: number): Point => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];

  // Words by line, in reading order, in viewport pixels.
  const byLine = new Map<
    number,
    Array<{ text: string; x0: number; y0: number; x1: number; y1: number }>
  >();
  for (const [text, x0, y0, x1, y1, line] of ocr.words) {
    if (!text || !(x1 > x0) || !(y1 > y0)) continue;
    const list = byLine.get(line) ?? [];
    list.push({ text, x0: x0 * W, y0: y0 * H, x1: x1 * W, y1: y1 * H });
    byLine.set(line, list);
  }

  /** One run from a band's corners (viewport px): top-left, bottom-left, bottom-right. */
  const pushRun = (str: string, tl: Point, bl: Point, br: Point, line: number, hasEOL = false) => {
    const pTL = toPdf(tl);
    const pBL = toPdf(bl);
    const pBR = toPdf(br);
    const up = sub(pTL, pBL);
    const along = sub(pBR, pBL);
    const height = length(up);
    const width = length(along);
    // The direction of the baseline; a zero-width run (the line's end) takes
    // it from the band's height instead, turned a quarter.
    const unit: Point =
      width > 0
        ? [along[0] / width, along[1] / width]
        : height > 0
          ? [up[1] / height, -up[0] / height]
          : [1, 0];
    const origin = toPdf(lerp(tl, bl, ascent));
    items.push({
      str,
      dir: 'ltr',
      transform: [unit[0] * height, unit[1] * height, up[0], up[1], origin[0], origin[1]],
      width,
      height,
      fontName: OCR_FONT_NAME,
      hasEOL,
    });
    lineOf.push(line);
  };

  for (const line of [...byLine.keys()].sort((a, b) => a - b)) {
    const words = byLine.get(line)!;
    const box = ocr.lines[line];
    const tallest = Math.max(...words.map((w) => w.y1 - w.y0));

    // The band each word sits in. A straight line shares its box, so a short
    // word ("a") and a tall one ("Typography") highlight at the same height
    // on the same baseline. A tilted line follows a baseline fitted through
    // its words' centres, at the height of its tallest word.
    const lineTop = box ? box[1] * H : Math.min(...words.map((w) => w.y0));
    const lineBottom = box ? box[3] * H : Math.max(...words.map((w) => w.y1));
    let bandTop: (x: number) => number = () => lineTop;
    let bandBottom: (x: number) => number = () => lineBottom;
    if (words.length >= 2 && lineBottom - lineTop > tallest * (1 + SKEW_DRIFT)) {
      const xs = words.map((w) => (w.x0 + w.x1) / 2);
      const ys = words.map((w) => (w.y0 + w.y1) / 2);
      const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
      const my = ys.reduce((s, v) => s + v, 0) / ys.length;
      let cov = 0;
      let varX = 0;
      for (let i = 0; i < xs.length; i += 1) {
        cov += (xs[i] - mx) * (ys[i] - my);
        varX += (xs[i] - mx) ** 2;
      }
      const slope = varX > 0 ? Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, cov / varX)) : 0;
      const centre = (x: number) => my + slope * (x - mx);
      bandTop = (x) => centre(x) - tallest / 2;
      bandBottom = (x) => centre(x) + tallest / 2;
    }

    words.forEach((word, i) => {
      const tl: Point = [word.x0, bandTop(word.x0)];
      const bl: Point = [word.x0, bandBottom(word.x0)];
      const br: Point = [word.x1, bandBottom(word.x1)];
      pushRun(word.text, tl, bl, br, line);

      const next = words[i + 1];
      if (next) {
        // The gap to the next word, as a space of its own. A negative gap
        // (overlapping boxes) collapses to a zero-width space.
        const endX = Math.max(word.x1, next.x0);
        pushRun(
          ' ',
          [word.x1, bandTop(word.x1)],
          [word.x1, bandBottom(word.x1)],
          [endX, bandBottom(endX)],
          line,
        );
      } else {
        // The line's end: no text, a break in the selection.
        pushRun(
          '',
          [word.x1, bandTop(word.x1)],
          [word.x1, bandBottom(word.x1)],
          [word.x1, bandBottom(word.x1)],
          line,
          true,
        );
      }
    });
  }

  return { content, lineOf };
}

/** How many letters and digits a page's own text layer carries. */
export function countAlphanumerics(strings: readonly string[]): number {
  let count = 0;
  for (const s of strings) {
    for (const ch of s) if (/[\p{L}\p{N}]/u.test(ch)) count += 1;
  }
  return count;
}

/**
 * Below this many letters and digits a page's own text layer is empty for
 * reading purposes — the same threshold the worker uses to decide a page
 * needs OCR (`MIN_ALNUM_PER_PAGE` in workers/pdf.py). A scan routinely carries
 * a stray page number or a producer's watermark and nothing else.
 */
export const MIN_ALNUM_PER_PAGE = 20;

/*
 * Text printed on most pages is not any page's own text: a download site's
 * watermark, a running header, a copyright line. A scanned book with a text
 * watermark stamped on every page carries ~24 letters of it everywhere — enough
 * to pass MIN_ALNUM_PER_PAGE, so it looked digital and never asked for OCR.
 * Same rule as `_real_text_flags` in workers/pdf.py: whatever repeats on at
 * least half the pages (and at least 3) is set aside when counting.
 */
const BOILERPLATE_MIN_PAGES = 3;
const BOILERPLATE_PAGE_SHARE = 0.5;

/** A text run with its numbers, case, spacing and direction marks taken out. */
export function boilerplateKey(s: string): string {
  return s
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .toLowerCase()
    .replace(/\d+/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** The runs that repeat across a sample of the document's pages. */
export function findBoilerplate(pages: readonly (readonly string[])[]): Set<string> {
  const common = new Set<string>();
  if (pages.length < BOILERPLATE_MIN_PAGES) return common;
  const seen = new Map<string, number>();
  for (const strings of pages) {
    for (const key of new Set(strings.map(boilerplateKey))) {
      if (countAlphanumerics([key]) >= 3) seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(
    BOILERPLATE_MIN_PAGES,
    Math.ceil(pages.length * BOILERPLATE_PAGE_SHARE),
  );
  for (const [key, count] of seen) if (count >= threshold) common.add(key);
  return common;
}

/** How many letters and digits a page carries of its own, boilerplate aside. */
export function countOwnAlphanumerics(
  strings: readonly string[],
  boilerplate: ReadonlySet<string>,
): number {
  return countAlphanumerics(strings.filter((s) => !boilerplate.has(boilerplateKey(s))));
}
