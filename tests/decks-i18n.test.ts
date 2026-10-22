import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const LOCALES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh'];
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(ROOT, `src/i18n/locales/${l}/decks.json`), 'utf8'));

/** Flatten to dotted keys, folding plural suffixes (`_one`, `_other`, …) into one key. */
function flat(obj: Record<string, unknown>, pre = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flat(v as Record<string, unknown>, `${pre}${k}.`).forEach((x, y) => out.set(y, x));
    else out.set(`${pre}${k}`.replace(/_(zero|one|two|few|many|other)$/, ''), String(v));
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');

describe('decks namespace', () => {
  const en = flat(load('en'));

  it.each(LOCALES.filter((l) => l !== 'en'))('%s has every key of en, with the same placeholders', (l) => {
    const other = flat(load(l));
    const missing = [...en.keys()].filter((k) => !other.has(k));
    const extra = [...other.keys()].filter((k) => !en.has(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    const badPlaceholders = [...en.keys()].filter((k) => placeholders(en.get(k)!) !== placeholders(other.get(k) ?? ''));
    expect(badPlaceholders).toEqual([]);
  });

  it.each(LOCALES.filter((l) => !['en', 'fr'].includes(l)))('%s is really translated (not English)', (l) => {
    const other = flat(load(l));
    const same = [...en.keys()].filter((k) => other.get(k) === en.get(k) && /[a-z]{4,}/.test(en.get(k)!) && !/^(FSRS|SM-2|Anki|CSV|Quizlet)/.test(en.get(k)!));
    // A handful of brand words may legitimately match; a whole untranslated file may not.
    expect(same.length).toBeLessThan(8);
  });

  it('every key the screens ask for exists', () => {
    const files: string[] = [];
    const walk = (d: string) =>
      fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) files.push(p);
      });
    walk(path.join(ROOT, 'src/pages/review'));
    walk(path.join(ROOT, 'src/pages/explore'));
    const used = new Set<string>();
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      if (!/useTranslation\('decks'\)/.test(src)) continue;
      for (const m of src.matchAll(/\bt\('([A-Za-z0-9_.]+)'/g)) used.add(m[1]);
    }
    const missing = [...used].filter((k) => !en.has(k));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(150);
  });
});
