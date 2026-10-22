import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUNDLED_LANG_PATH, LANG_PATH, langPathFor } from '@/pages/reader/ocr/engine';

describe('bundled OCR language data', () => {
  it('reads English and French from the app, every other language from the pinned CDN', () => {
    expect(langPathFor('eng')).toBe(BUNDLED_LANG_PATH);
    expect(langPathFor('fra')).toBe(BUNDLED_LANG_PATH);
    expect(langPathFor('spa')).toBe(LANG_PATH);
    expect(LANG_PATH).toContain('4.0.0_best_int');
  });

  it('ships real gzip tessdata files that match the sync script pins', () => {
    const script = readFileSync('scripts/sync-tesseract.mjs', 'utf8');
    for (const code of ['eng', 'fra']) {
      const bytes = readFileSync(`public/tesseract/lang/${code}.traineddata.gz`);
      const sha = createHash('sha256').update(bytes).digest('hex');
      expect(script).toContain(sha);
      expect(gunzipSync(bytes).length).toBeGreaterThan(1_000_000);
    }
  });
});
