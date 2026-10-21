/**
 * Copy tesseract.js' worker script and its WASM cores into `public/tesseract/`.
 *
 * OCR runs on the user's computer, in the webview, so the engine itself must be
 * served from the app's own origin — never from a CDN (the app has to start
 * reading a scan with no network once a language is cached).
 *
 * Only the LSTM-only cores are copied, because the worker is created with the
 * LSTM engine. All THREE are copied on purpose:
 *
 * - `tesseract-core-lstm`              — plain WASM. A CPU without SIMD (an old
 *                                        i5-3210M laptop has no AVX2) can only run this.
 * - `tesseract-core-simd-lstm`         — WASM SIMD.
 * - `tesseract-core-relaxedsimd-lstm`  — relaxed SIMD, the fastest.
 *
 * tesseract.js feature-detects at run time and picks the best one the webview
 * supports, so a dropped file would not fail on a new machine — it would fail
 * on exactly the old machine nobody tests on. The `.wasm.js` files carry the
 * WASM inline, so no separate `.wasm` fetch (and no extra CSP) is involved.
 *
 * The copies are committed, and this script runs in the `sync:*` chain, so a
 * tesseract.js upgrade cannot leave a worker and a core of different versions
 * side by side.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const tessPkg = dirname(require.resolve('tesseract.js/package.json'));
// pnpm does not hoist the core next to the app: resolve it from tesseract.js.
const corePkg = dirname(createRequire(join(tessPkg, 'package.json')).resolve('tesseract.js-core/package.json'));
const out = join(root, 'public', 'tesseract');

const CORES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(join(tessPkg, 'dist', 'worker.min.js'), join(out, 'worker.min.js'));
for (const file of CORES) copyFileSync(join(corePkg, file), join(out, file));

const version = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
console.log(`tesseract assets synced to public/tesseract (tesseract.js ${version(tessPkg)}, core ${version(corePkg)})`);
