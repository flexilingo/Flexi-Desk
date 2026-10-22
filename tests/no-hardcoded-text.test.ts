import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Folders/files whose user-visible strings must all go through react-i18next.
const TARGETS = [
  'src/pages/tutor',
  'src/pages/caption',
  'src/pages/settings',
  'src/components/onboarding',
  'src/components/auth',
];

function walk(p: string, out: string[] = []): string[] {
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p)) walk(join(p, f), out);
  } else if (p.endsWith('.tsx')) {
    out.push(p);
  }
  return out;
}

// JSX text: letters between `>` and `<` that are not inside {expressions}.
const JSX_TEXT = />\s*([^<>{}=\n][^<>{}\n]*[A-Za-z؀-ۿ][^<>{}\n]*)\s*</g;
// Literal attribute values a user can see.
const ATTR = /\b(placeholder|title|aria-label|alt)=("[^"]*[A-Za-z][^"]*")/g;
// Allowed non-words: tech/brand tokens that are never translated.
const ALLOWED = new Set(['CSV', 'TSV', 'Anki', 'Whisper', 'Ollama', 'FlexiLingo', 'IPA', 'CEFR', 'AI']);

function findings(file: string): string[] {
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  for (const m of src.matchAll(JSX_TEXT)) {
    const text = m[1].trim();
    // Skip TS generics / comparison fragments such as `<T>(a) => b >`.
    if (/[=;()]|=>/.test(text)) continue;
    if (!/[A-Za-z؀-ۿ]{2,}/.test(text)) continue;
    if (ALLOWED.has(text)) continue;
    out.push(`text "${text}"`);
  }
  for (const m of src.matchAll(ATTR)) {
    const val = m[2].slice(1, -1);
    if (ALLOWED.has(val) || val.startsWith('/') || val === 'base' || /^[a-z0-9@.+_-]*@example\.com$/.test(val)) continue;
    out.push(`${m[1]}=${m[2]}`);
  }
  return out;
}

describe('no hardcoded JSX text in translated screens', () => {
  for (const dir of TARGETS) {
    for (const file of walk(dir)) {
      it(file, () => {
        expect(findings(file)).toEqual([]);
      });
    }
  }
});

describe('no raw red hex outside the theme file', () => {
  it('uses the destructive token', () => {
    const bad: string[] = [];
    for (const f of walk('src')) {
      if (f.includes('/pages/podcast/')) continue; // owned by the player parity work
      if (readFileSync(f, 'utf8').includes('#ef4444')) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
});

describe('locale parity for the translated screens', () => {
  const flat = (o: Record<string, unknown>, pre = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' ? flat(v as Record<string, unknown>, `${pre}${k}.`) : [`${pre}${k}`],
    );
  const strip = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '');
  for (const ns of ['tutor', 'caption', 'settingsDesk', 'onboarding', 'authDesk']) {
    it(`${ns} has the same keys in en fa ar fr hi zh`, () => {
      const load = (l: string) =>
        new Set(flat(JSON.parse(readFileSync(`src/i18n/locales/${l}/${ns}.json`, 'utf8'))).map(strip));
      const en = load('en');
      expect(en.size).toBeGreaterThan(5);
      for (const l of ['fa', 'ar', 'fr', 'hi', 'zh']) {
        const other = load(l);
        expect([...en].filter((k) => !other.has(k))).toEqual([]);
      }
    });
  }
});
