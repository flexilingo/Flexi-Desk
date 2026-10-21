/**
 * Copy pdf.js's worker and its on-demand data files into `public/`.
 *
 * The worker is served as a static asset rather than resolved through the
 * bundler (`new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`)
 * because that resolution silently differs between `next dev --turbo` and the
 * production build, and when it misses, pdf.js does not fail loudly: it falls
 * back to parsing on the main thread, so a 200-page PDF freezes the tab instead
 * of erroring.
 *
 * The four data directories are not optional decoration for this product. A PDF
 * only carries the glyphs it uses; everything else is looked up at render time:
 *
 * - `cmaps`          — the Adobe CMaps. Without them a Chinese, Japanese or
 *                      Korean PDF renders as blanks or garbage, which is half
 *                      the languages we teach.
 * - `standard_fonts` — the 14 PDF base fonts. A PDF that says "Helvetica" and
 *                      embeds nothing is extremely common.
 * - `wasm`           — JPEG 2000 / JBIG2 decoders, i.e. scanned documents.
 * - `iccs`           — colour profiles for tagged images.
 *
 * All of it is fetched only when a document actually needs it, so the cost to a
 * plain text PDF is zero bytes.
 *
 * The copies are committed, so a plain checkout works with no extra step, and
 * this script runs on `prebuild` so a `pdfjs-dist` upgrade cannot leave stale
 * ones behind — a version skew between the API and the worker is a hard failure
 * whose message points nowhere near the real cause.
 */
import { cpSync, copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'node_modules', 'pdfjs-dist');
const out = join(root, 'public', 'pdf-worker');

const DATA_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

copyFileSync(join(pkg, 'build', 'pdf.worker.min.mjs'), join(out, 'pdf.worker.min.mjs'));
for (const dir of DATA_DIRS) {
  cpSync(join(pkg, dir), join(out, dir), { recursive: true });
}

const { version } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
console.log(`pdf.js assets synced to public/pdf-worker (pdfjs-dist ${version})`);
