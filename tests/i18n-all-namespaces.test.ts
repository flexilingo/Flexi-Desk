import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LOCALES_DIR = path.resolve(__dirname, '../src/i18n/locales');
const LOCALES = ['fa', 'ar', 'fr', 'hi', 'zh', 'de', 'vi'];
const NAMESPACES = fs
  .readdirSync(path.join(LOCALES_DIR, 'en'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

/** Brand / product names and technical strings that legitimately read the same in every language. */
const SAME_AS_ENGLISH = [/^(FlexiLingo|FlexiDesk|OpenAI|Anthropic|Ollama|Whisper)\b/, /^~?[0-9]/];

const load = (locale: string, ns: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, `${ns}.json`), 'utf8'));

const PLURAL = /_(zero|one|two|few|many|other)$/;

function flat(obj: Record<string, unknown>, pre = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v))
      flat(v as Record<string, unknown>, `${pre}${k}.`).forEach((x, y) => out.set(y, x));
    else out.set(`${pre}${k}`, v);
  }
  return out;
}

/** Group plural forms under one folded key; placeholders are unioned across the forms. */
function folded(obj: Record<string, unknown>): Map<string, { text: string[]; names: string }> {
  const out = new Map<string, { text: string[]; names: string }>();
  for (const [k, v] of flat(obj)) {
    const key = k.replace(PLURAL, '');
    const texts = Array.isArray(v) ? v.map(String) : [String(v)];
    const cur = out.get(key) ?? { text: [], names: '' };
    cur.text.push(...texts);
    out.set(key, cur);
  }
  for (const v of out.values()) {
    v.names = [
      ...new Set(v.text.flatMap((t) => [...t.matchAll(/\{\{\s*(\w+)[^}]*\}\}/g)].map((m) => m[1]))),
    ]
      .sort()
      .join(',');
  }
  return out;
}

const words = (s: string) => s.replace(/\{\{[^}]*\}\}|<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
const sameOk = (s: string) => SAME_AS_ENGLISH.some((re) => re.test(s));

describe('i18n: every namespace in every locale', () => {
  it('has all namespaces', () => {
    expect(NAMESPACES.length).toBeGreaterThan(20);
    for (const l of LOCALES)
      for (const ns of NAMESPACES)
        expect(fs.existsSync(path.join(LOCALES_DIR, l, `${ns}.json`)), `${l}/${ns}.json`).toBe(true);
  });

  for (const ns of NAMESPACES) {
    describe(ns, () => {
      const en = folded(load('en', ns));
      for (const l of LOCALES) {
        it(`${l}: same keys, same placeholders, no empty strings, translated`, () => {
          const loc = folded(load(l, ns));
          const missing = [...en.keys()].filter((k) => !loc.has(k));
          const extra = [...loc.keys()].filter((k) => !en.has(k));
          expect(missing, `${l}/${ns} missing`).toEqual([]);
          expect(extra, `${l}/${ns} extra`).toEqual([]);
          const badPh: string[] = [];
          const empty: string[] = [];
          const untranslated: string[] = [];
          for (const [k, e] of en) {
            const t = loc.get(k)!;
            if (t.names !== e.names) badPh.push(`${k}: ${e.names} vs ${t.names}`);
            if (t.text.some((x) => x.trim() === '')) empty.push(k);
            const enText = e.text[e.text.length - 1];
            if (
              t.text.length === e.text.length &&
              t.text.every((x, i) => x === e.text[i]) &&
              words(enText).length > 3 &&
              !sameOk(enText)
            )
              untranslated.push(k);
          }
          expect(badPh, 'placeholders').toEqual([]);
          expect(empty, 'empty').toEqual([]);
          expect(untranslated, 'identical to English').toEqual([]);
        });
      }
    });
  }
});
