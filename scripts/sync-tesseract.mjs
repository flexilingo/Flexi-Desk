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
 *
 * LANGUAGE DATA: English and French (`eng`, `fra`) are bundled in
 * `public/tesseract/lang/`, so the first scan works with no network. They are the
 * same pinned `4.0.0_best_int` files the engine downloads for every other
 * language (keep TESSDATA_COMMIT in `src/pages/reader/ocr/engine.ts` in lockstep).
 * A missing file is fetched once from that pinned URL and its SHA-256 checked;
 * files already present are kept (and checked), never re-downloaded.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// Clear the engine files only: `lang/` holds the committed language data.
mkdirSync(out, { recursive: true });
for (const name of readdirSync(out)) if (name !== 'lang') rmSync(join(out, name), { recursive: true, force: true });
copyFileSync(join(tessPkg, 'dist', 'worker.min.js'), join(out, 'worker.min.js'));
for (const file of CORES) copyFileSync(join(corePkg, file), join(out, file));

const TESSDATA_COMMIT = '806cd9a';
const LANG_URL = `https://cdn.jsdelivr.net/gh/naptha/tessdata@${TESSDATA_COMMIT}/4.0.0_best_int`;
const BUNDLED_LANGS = {
  eng: '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
  fra: 'd611139672b3752c7097e671e4a1d9209dfd37f2aeb081ef6487fba3351e9255',
};
const langDir = join(out, 'lang');
mkdirSync(langDir, { recursive: true });
for (const [code, sha] of Object.entries(BUNDLED_LANGS)) {
  const file = join(langDir, `${code}.traineddata.gz`);
  if (!existsSync(file)) {
    const res = await fetch(`${LANG_URL}/${code}.traineddata.gz`);
    if (!res.ok) throw new Error(`could not download ${code} language data (${res.status})`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const got = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (got !== sha) throw new Error(`${code}.traineddata.gz does not match the pinned file (${got})`);
}

const version = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
console.log(`tesseract assets synced to public/tesseract (tesseract.js ${version(tessPkg)}, core ${version(corePkg)})`);
