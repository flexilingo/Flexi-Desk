import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const LOCALES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh'];
const load = (l: string) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, `src/i18n/locales/${l}/account.json`), 'utf8'));

function flat(obj: Record<string, unknown>, pre = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object')
      flat(v as Record<string, unknown>, `${pre}${k}.`).forEach((x, y) => out.set(y, x));
    else out.set(`${pre}${k}`.replace(/_(zero|one|two|few|many|other)$/, ''), String(v));
  }
  return out;
}
const placeholders = (s: string) =>
  [...s.matchAll(/\{\{(\w+)\}\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

describe('account namespace', () => {
  const en = flat(load('en'));

  it.each(LOCALES.filter((l) => l !== 'en'))(
    '%s has every key of en with the same placeholders',
    (l) => {
      const other = flat(load(l));
      expect([...en.keys()].filter((k) => !other.has(k))).toEqual([]);
      expect(
        [...en.keys()].filter((k) => placeholders(en.get(k)!) !== placeholders(other.get(k) ?? '')),
      ).toEqual([]);
    },
  );

  it.each(LOCALES)('%s has no leftover ICU braces', (l) => {
    const bad = [...flat(load(l)).entries()].filter(([, v]) =>
      /\{[^{}]*\}/.test(v.replace(/\{\{\w+\}\}/g, '')),
    );
    expect(bad).toEqual([]);
  });

  it.each(LOCALES.filter((l) => l !== 'en'))('%s desk strings are really translated', (l) => {
    const other = flat(load(l));
    const same = [...en.keys()].filter(
      (k) => k.startsWith('desk.') && en.get(k) === other.get(k) && en.get(k)!.length > 12,
    );
    expect(same).toEqual([]);
  });

  it('every static t(...) key used by the account screens exists', () => {
    const dirs = [
      'src/pages/account',
      'src/pages/subscription',
      'src/pages/whatsnew',
      'src/components/layout/GlobalNotices.tsx',
      'src/components/auth/GoogleSignInButton.tsx',
    ];
    const files: string[] = [];
    const walk = (p: string) => {
      const full = path.join(ROOT, p);
      if (fs.statSync(full).isDirectory())
        fs.readdirSync(full).forEach((f) => walk(path.join(p, f)));
      else if (/\.tsx?$/.test(full)) files.push(full);
    };
    dirs.forEach(walk);
    const missing: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      // helpers: t('a.b'), tp('x') (= subscription.proPage.), ts('x') (= subscription.), tl('x') (leaderboard)
      const prefixes: Record<string, string> = {
        t: '',
        tp: 'subscription.proPage.',
        ts: 'subscription.',
        tl: 'community.dashboard.leaderboard.',
        tt: 'subscription.',
      };
      for (const m of src.matchAll(/\b(t|tp|ts|tl|tt)\(\s*'([A-Za-z0-9_.]+)'/g)) {
        const key = prefixes[m[1]] + m[2];
        // Helpers handed a `subscription.` translator (limitText, BENEFITS) pass keys starting at proPage.
        if (!en.has(key) && !en.has(`subscription.${key}`))
          missing.push(`${path.basename(f)}: ${key}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
