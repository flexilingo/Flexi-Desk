import type { OcrWords } from '../types';

/*
 * tesseract.js' word-level output -> the `OcrWords` object the reader stores
 * (`reader_ocr_pages.words_json`), the same shape the website's worker writes
 * (`_word_layout` in workers/image.py): fractions (0..1, 4 decimals) of the
 * image that was read, one line index per word, noise dropped.
 */

export interface TessBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface TessWord {
  text: string;
  confidence: number;
  bbox: TessBox;
}
export interface TessLine {
  words: TessWord[];
}
export interface TessBlock {
  paragraphs: Array<{ lines: TessLine[] }>;
}

// Same thresholds as the server worker, so a scan reads the same here as there.
const MIN_LINE_CONF = 60;
const MIN_WORD_CONF = 30;
const RESCUE_WORD_CONF = 85;

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function letters(text: string): number {
  let count = 0;
  for (const ch of text) if (/\p{L}/u.test(ch)) count += 1;
  return count;
}
const hasAlnum = (text: string) => /[\p{L}\p{N}]/u.test(text);

/**
 * @param blocks tesseract's `data.blocks` (null when the page had none)
 * @param width  pixel width of the image that was read
 * @param height pixel height of the image that was read
 */
export function layoutFromBlocks(
  blocks: readonly TessBlock[] | null | undefined,
  width: number,
  height: number,
): OcrWords {
  const out: OcrWords = { v: 1, lines: [], words: [] };
  if (!blocks || width <= 0 || height <= 0) return out;
  const fx = (value: number) => round4(clamp01(value / width));
  const fy = (value: number) => round4(clamp01(value / height));

  for (const block of blocks) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        // NFKC, so a ligature or a full-width letter still finds its dictionary entry on tap.
        const members = (line.words ?? [])
          .map((w) => ({ ...w, text: (w.text ?? '').normalize('NFKC').trim() }))
          .filter((w) => w.text);
        if (!members.length) continue;
        const lineOk =
          members.reduce((sum, w) => sum + w.confidence, 0) / members.length >= MIN_LINE_CONF;
        const kept = members.filter(
          (w) =>
            (lineOk
              ? w.confidence >= MIN_WORD_CONF
              : w.confidence >= RESCUE_WORD_CONF && letters(w.text) >= 2) &&
            w.bbox.x1 > w.bbox.x0 &&
            w.bbox.y1 > w.bbox.y0 &&
            hasAlnum(w.text),
        );
        if (!kept.length) continue;
        const index = out.lines.length;
        out.lines.push([
          fx(Math.min(...kept.map((w) => w.bbox.x0))),
          fy(Math.min(...kept.map((w) => w.bbox.y0))),
          fx(Math.max(...kept.map((w) => w.bbox.x1))),
          fy(Math.max(...kept.map((w) => w.bbox.y1))),
        ]);
        for (const w of kept) {
          out.words.push([
            w.text,
            fx(w.bbox.x0),
            fy(w.bbox.y0),
            fx(w.bbox.x1),
            fy(w.bbox.y1),
            index,
          ]);
        }
      }
    }
  }
  return out;
}
