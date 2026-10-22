import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh'];
const load = (l: string) => JSON.parse(readFileSync(join(__dirname, `../src/i18n/locales/${l}/sentences.json`), 'utf8'));

const flat = (o: unknown, prefix = ''): Record<string, string> =>
  Object.entries(o as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(acc, flat(v, key));
    else acc[key] = String(v);
    return acc;
  }, {});

const en = flat(load('en'));
const PLURAL = /_(zero|one|two|few|many|other)$/;

describe('sentences namespace, six languages', () => {
  for (const l of LOCALES) {
    it(`${l}: every English key exists with real text (plural forms aside)`, () => {
      const mine = flat(load(l));
      const missing = Object.keys(en).filter((k) => !(k in mine));
      expect(missing).toEqual([]);
      for (const [k, v] of Object.entries(mine)) expect(v.trim(), `${l}:${k}`).not.toBe('');
    });

    it(`${l}: uses i18next placeholders ({{x}}), never the website's {x}`, () => {
      for (const [k, v] of Object.entries(flat(load(l)))) {
        expect(v.replace(/\{\{\w+\}\}/g, ''), `${l}:${k}`).not.toMatch(/\{\w+\}/);
        expect(v, `${l}:${k}`).not.toMatch(/\{\{\{/);
      }
    });

    it(`${l}: a placeholder in English is a placeholder in ${l}`, () => {
      const mine = flat(load(l));
      for (const [k, v] of Object.entries(en)) {
        // Arabic's one/two forms say «one day» / «two days» in words, with no number to fill in.
        if (l === 'ar' && /_(one|two)$/.test(k)) continue;
        for (const ph of v.match(/\{\{\w+\}\}/g) ?? []) expect(mine[k], `${l}:${k}`).toContain(ph);
      }
    });
  }

  it('the translations are not the English copied', () => {
    for (const l of LOCALES.filter((x) => x !== 'en' && x !== 'fr')) {
      const mine = flat(load(l));
      const same = ['title', 'tagline', 'desk.comingTitle', 'desk.comingBody', 'history.title'].filter((k) => mine[k] === en[k]);
      expect(same, l).toEqual([]);
    }
  });

  it('Arabic has its plural forms for the listening count', () => {
    const ar = flat(load('ar'));
    for (const f of ['one', 'two', 'few', 'many', 'other']) expect(ar[`listen.count_${f}`]).toBeTruthy();
  });

  it('no emojis anywhere in the strings', () => {
    for (const l of LOCALES) {
      for (const [k, v] of Object.entries(flat(load(l)))) expect(v, `${l}:${k}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('every literal t(...) key used by the sentences screens exists in English', () => {
    const root = join(__dirname, '../src/pages/sentences');
    const files: string[] = [];
    const walk = (d: string) =>
      readdirSync(d).forEach((f) => {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p)) files.push(p);
      });
    walk(root);
    const keys = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // Files that scope `t` with keyPrefix (the scorecard) use keys relative to it.
      if (src.includes('keyPrefix')) continue;
      // t('a.b'), keyPrefix-less only; template keys (`x.${y}`) are checked by their prefix below.
      for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) keys.add(m[1]);
    }
    const bare = (k: string) => k.replace(PLURAL, '');
    const have = new Set(Object.keys(en).map(bare));
    const missing = [...keys].filter((k) => !have.has(k) && !Object.keys(en).some((e) => e.startsWith(`${k}.`)));
    expect(missing).toEqual([]);
  });

  it('every error code the screens can show is translated', () => {
    for (const code of ['QUOTA_USER', 'QUOTA_IP', 'TOO_FAST', 'NOT_DEALT', 'AUTH_REQUIRED', 'RATE_LIMITED', 'UNKNOWN_ERROR', 'AUDIO_UNAVAILABLE', 'PENDING_LOCALE', 'NETWORK']) {
      for (const l of LOCALES) expect(flat(load(l))[`errors.${code}`], `${l}:${code}`).toBeTruthy();
    }
  });
});

describe('schedule plurals', () => {
  it('English says "1 day" and "3 days"', async () => {
    const i18n = (await import('i18next')).default;
    await import('@/i18n/config');
    await i18n.changeLanguage('en');
    expect(i18n.t('sentences:schedule.later', { days: 1, count: 1 })).toContain('in 1 day.');
    expect(i18n.t('sentences:schedule.later', { days: 3, count: 3 })).toContain('in 3 days.');
    await i18n.changeLanguage('ar');
    expect(i18n.t('sentences:schedule.later', { days: 2, count: 2 })).toContain('يومين');
  });
});
