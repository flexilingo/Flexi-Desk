import { createOcrEngine, type EngineStatus } from '@/pages/reader/ocr/engine';
import { ocrLanguageFor } from '@/pages/reader/ocr/languages';
import type { OcrWords } from '@/pages/reader/types';

/** Longest side the engine is given; bigger photos are scaled down (phones shoot 4000+). */
const MAX_SIDE = 4000;

/** The recognised words back into lines of text, in reading order. */
export function wordsToText(ocr: OcrWords): string {
  const lines: string[][] = [];
  for (const [text, , , , , line] of ocr.words) {
    (lines[line] ??= []).push(text);
  }
  return lines
    .filter((l) => l && l.length)
    .map((l) => l.join(' '))
    .join('\n')
    .trim();
}

/** Scale factor so the longest side fits `MAX_SIDE` (never enlarges). */
export function fitScale(width: number, height: number, max = MAX_SIDE): number {
  const longest = Math.max(width, height);
  return longest > max ? max / longest : 1;
}

async function toCanvas(bytes: ArrayBuffer): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(new Blob([bytes]));
  const scale = fitScale(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NO_CANVAS');
  ctx.fillStyle = '#ffffff'; // transparent PNGs read as black text on black otherwise
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/**
 * Reads the text of an image with the Reader's in-app tesseract.js engine — no
 * install needed, so it works on Windows. The language data downloads once.
 */
export async function ocrImageLocally(
  bytes: ArrayBuffer,
  language: string,
  onStatus?: (status: EngineStatus) => void,
): Promise<string> {
  const canvas = await toCanvas(bytes);
  const engine = await createOcrEngine({
    language: ocrLanguageFor(language).code,
    workers: 1,
    onStatus,
  });
  try {
    return wordsToText(await engine.recognize(canvas, 0));
  } finally {
    await engine.terminate();
  }
}
