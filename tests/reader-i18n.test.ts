import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh'] as const;
const NAMESPACES = ['reader', 'readingLibrary'] as const;
const PLURAL = /_(zero|one|two|few|many|other)$/;

type Json = { [k: string]: string | Json };

const load = (l: string, ns: string): Json =>
  JSON.parse(readFileSync(join(__dirname, '../src/i18n/locales', l, `${ns}.json`), 'utf8'));

/** base key -> union of {{placeholders}} across its plural forms. Plural suffixes are folded. */
function flatten(node: Json, prefix = '', out = new Map<string, Set<string>>()) {
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      const base = (prefix + k).replace(PLURAL, '');
      const set = out.get(base) ?? new Set<string>();
      for (const m of v.matchAll(/\{\{(\w+)\}\}/g)) set.add(m[1]);
      out.set(base, set);
      // no ICU leftovers
      expect(v.replace(/\{\{\w+\}\}/g, ''), `${prefix}${k}`).not.toMatch(/[{}#]/);
    } else flatten(v, `${prefix}${k}.`, out);
  }
  return out;
}

describe.each(NAMESPACES)('%s namespace', (ns) => {
  const en = flatten(load('en', ns));

  it('has the website key counts', () => {
    expect(en.size).toBe(ns === 'reader' ? 241 : 86); // readingLibrary: 58 + series (19 + 6 progress) + pagination (3)
  });

  it.each(LOCALES.filter((l) => l !== 'en'))('%s has the same keys and placeholders as en', (l) => {
    const other = flatten(load(l, ns));
    expect([...other.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, ph] of en) {
      // A locale may drop the number when a plural form spells it out ("كتاب واحد").
      const got = other.get(key)!;
      const want = new Set([...ph].filter((p) => p !== 'count' || got.has('count')));
      expect([...got].sort(), key).toEqual([...want].sort());
    }
  });
});

describe('readerDesk namespace (desk-only strings)', () => {
  const keys = (l: string) => [...flatten(load(l, 'readerDesk')).keys()].sort();
  it.each(LOCALES.filter((l) => l !== 'en'))('%s has the same keys as en', (l) => {
    expect(keys(l)).toEqual(keys('en'));
  });
  it('covers the codes the viewer resolves', () => {
    expect(keys('en')).toEqual(
      expect.arrayContaining(['errors.PDF_PASSWORD_PROTECTED', 'errors.PDF_COULD_NOT_OPEN', 'errors.UNKNOWN_ERROR', 'home.openPdf']),
    );
  });
});
