import type { OcrWords } from '@/pages/reader/types';

/** The same rules the Rust command enforces (`validate_ocr_words`). */
export function validateWords(w: OcrWords): boolean {
  const frac = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
  return (
    w.v === 1 &&
    w.lines.every((l) => l.length === 4 && l.every(frac)) &&
    w.words.every(
      (x) =>
        typeof x[0] === 'string' &&
        x.slice(1, 5).every((n) => frac(n as number)) &&
        Number.isInteger(x[5]) &&
        x[5] >= 0 &&
        x[5] < w.lines.length,
    )
  );
}
