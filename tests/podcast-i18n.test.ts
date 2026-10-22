import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const LOCALES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh'];
const NAMESPACES = ['podcastUi', 'listening'];
const PODCAST_DIR = path.join(ROOT, 'src/pages/podcast');

const load = (locale: string, ns: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(ROOT, `src/i18n/locales/${locale}/${ns}.json`), 'utf8'));

/** Flatten to dotted keys, folding plural suffixes (`_one`, `_other`, ...) into one key. */
function flat(obj: Record<string, unknown>, pre = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object')
      flat(v as Record<string, unknown>, `${pre}${k}.`).forEach((x, y) => out.set(y, x));
    else {
      // Plural forms of one key are joined, so placeholders are compared across all of them.
      const key = `${pre}${k}`.replace(/_(zero|one|two|few|many|other)$/, '');
      out.set(key, out.has(key) ? `${out.get(key)} | ${v}` : String(v));
    }
  }
  return out;
}

/** Every raw (unfolded) dotted key, so a literal `t('x_one')` style lookup also resolves. */
function rawKeys(obj: Record<string, unknown>, pre = ''): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object')
      rawKeys(v as Record<string, unknown>, `${pre}${k}.`).forEach((x) => out.add(x));
    else out.add(`${pre}${k}`);
  }
  return out;
}

const placeholders = (s: string) =>
  [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort().join(',');

function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.test(e.name)) out.push(p);
  }
  return out;
}

describe.each(NAMESPACES)('%s namespace', (ns) => {
  const en = flat(load('en', ns));

  it('has keys', () => {
    expect(en.size).toBeGreaterThan(10);
  });

  it.each(LOCALES.filter((l) => l !== 'en'))(
    '%s has every key of en, with the same placeholders',
    (l) => {
      const other = flat(load(l, ns));
      const missing = [...en.keys()].filter((k) => !other.has(k));
      const extra = [...other.keys()].filter((k) => !en.has(k));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      const bad = [...en.keys()].filter(
        (k) => placeholders(en.get(k)!) !== placeholders(other.get(k) ?? ''),
      );
      expect(bad).toEqual([]);
    },
  );

  it.each(LOCALES.filter((l) => l !== 'en'))('%s is really translated (not English)', (l) => {
    const other = flat(load(l, ns));
    // Brand words, units and symbols may legitimately match English.
    const same = [...en.keys()].filter(
      (k) =>
        other.get(k) === en.get(k) &&
        /[a-z]{4,}/.test(
          en
            .get(k)!
            .replace(/\{\{\w+\}\}/g, '')
            .replace(/<\/?\w+>/g, ''),
        ) &&
        !/^(FlexiLingo|Whisper|CEFR|IELTS|CELPIP|XP|OK)\b/.test(en.get(k)!),
    );
    // French shares many cognates with English; the other languages should share almost nothing.
    const limit = l === 'fr' ? Math.max(8, Math.round(en.size * 0.08)) : 8;
    expect(same.slice(0, 20)).toEqual(same.length < limit ? same.slice(0, 20) : []);
    expect(same.length).toBeLessThan(limit);
  });
});

describe('keys used by the podcast screens exist', () => {
  const rawByNs = new Map<string, Set<string>>();
  const foldedByNs = new Map<string, Map<string, string>>();
  for (const f of fs.readdirSync(path.join(ROOT, 'src/i18n/locales/en'))) {
    const ns = f.replace(/\.json$/, '');
    const json = load('en', ns);
    rawByNs.set(ns, rawKeys(json));
    foldedByNs.set(ns, flat(json));
  }
  const has = (ns: string, key: string) =>
    !!rawByNs.get(ns)?.has(key) ||
    !!foldedByNs.get(ns)?.has(key) ||
    !!rawByNs.get(ns)?.has(`${key}_other`) ||
    !!rawByNs.get(ns)?.has(`${key}_one`);

  const files = walk(PODCAST_DIR, /\.tsx?$/);

  it('every literal t()/tp() key resolves in its namespace', () => {
    const missing: string[] = [];
    let used = 0;
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      // const { t, i18n } = useTranslation('ns')  /  const { t: tp } = useTranslation(['a', 'b'])
      const bindings = new Map<string, string>();
      for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*useTranslation\(([^)]*)\)/g)) {
        const nsArg = m[2].match(/['"]([\w-]+)['"]/);
        const ns = nsArg ? nsArg[1] : 'common';
        const tm = m[1].match(/(?:^|,)\s*t(?:\s*:\s*(\w+))?\s*(?:,|$)/);
        if (tm) bindings.set(tm[1] ?? 't', ns);
      }
      // Helpers that receive a translate function (tf/tp/t as a parameter) use the podcastUi namespace.
      const aliases = new Set([...bindings.keys(), 'tf', 'tp']);
      for (const alias of aliases) {
        const boundNs = bindings.get(alias);
        const re = new RegExp(`(?<![\\w.])${alias}\\(\\s*['"\`]([\\w.:-]+)['"\`]`, 'g');
        for (const m of src.matchAll(re)) {
          let key = m[1];
          let ns = boundNs;
          const colon = key.indexOf(':');
          if (colon > 0) {
            ns = key.slice(0, colon);
            key = key.slice(colon + 1);
          }
          used++;
          const candidates = ns ? [ns] : ['podcastUi', 'listening', 'common'];
          if (!candidates.some((n) => has(n, key))) missing.push(`${rel}: ${ns ?? '?'}:${key}`);
        }
      }
      // Keys kept in data tables (labelKey: 'x.y') are resolved later by t(variable).
      for (const m of src.matchAll(/\b\w*Key:\s*['"]([A-Za-z][\w]*(?:\.[\w]+)+)['"]/g)) {
        used++;
        if (!['podcastUi', 'listening', 'common'].some((n) => has(n, m[1])))
          missing.push(`${rel}: ?:${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
    expect(used).toBeGreaterThan(300);
  });
});

/** Strip comments and className values so only user-facing text is left. */
function visibleSource(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\w])\/\/.*$/gm, '$1')
    .replace(/className=(\{`[^`]*`\}|"[^"]*"|\{[^{}]*\})/g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
}
const TWO_WORDS = /[A-Za-z]{2,}\s+[A-Za-z]{2,}/;

function hardcodedEnglish(src: string): string[] {
  const text = visibleSource(src);
  const hits: string[] = [];
  // JSX text nodes: >some words<
  for (const m of text.matchAll(/>([^<>{}=;`]+)</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (TWO_WORDS.test(t) && !/^[\w\s,.:;!?'"()-]*\b(from|import|extends)\b/.test(t)) hits.push(t);
  }
  // user-facing attributes with literal strings
  for (const m of text.matchAll(/\b(placeholder|title|aria-label|label|alt)=\{?"([^"]*)"\}?/g)) {
    if (TWO_WORDS.test(m[2])) hits.push(`${m[1]}="${m[2]}"`);
  }
  for (const m of text.matchAll(
    /\b(placeholder|title|aria-label|label|alt)=\{\s*'([^']*)'\s*\}/g,
  )) {
    if (TWO_WORDS.test(m[2])) hits.push(`${m[1]}='${m[2]}'`);
  }
  return hits;
}

describe('no hardcoded English in the podcast screens', () => {
  const tsx = walk(PODCAST_DIR, /\.tsx$/);

  it('finds the screens', () => {
    expect(tsx.length).toBeGreaterThan(60);
  });

  it('files without useTranslation render no English text or literal attributes', () => {
    const offenders: Record<string, string[]> = {};
    for (const file of tsx) {
      const src = fs.readFileSync(file, 'utf8');
      if (/useTranslation/.test(src)) continue;
      const hits = hardcodedEnglish(src);
      if (hits.length) offenders[path.relative(ROOT, file)] = hits.slice(0, 5);
    }
    expect(offenders).toEqual({});
  });

  it('files that use useTranslation have no leftover English text nodes or attributes either', () => {
    const offenders: Record<string, string[]> = {};
    for (const file of tsx) {
      const src = fs.readFileSync(file, 'utf8');
      if (!/useTranslation/.test(src)) continue;
      const hits = hardcodedEnglish(src);
      if (hits.length) offenders[path.relative(ROOT, file)] = hits.slice(0, 5);
    }
    expect(offenders).toEqual({});
  });
});
