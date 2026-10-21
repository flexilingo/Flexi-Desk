import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The CELPIP namespace was ported verbatim from front's next-intl `exam` messages.
 * Two things silently break the UI if they drift:
 *   - a key missing in one locale renders as the raw key path;
 *   - a plural key without an `_other` form throws at runtime in i18next.
 */

const LOCALES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh'] as const;
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

type Node = { [k: string]: Node | string };

function load(locale: string): Node {
  const p = resolve(__dirname, `../src/i18n/locales/${locale}/celpip.json`);
  return JSON.parse(readFileSync(p, 'utf-8')) as Node;
}

function leaves(node: Node, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[path] = v;
    else Object.assign(out, leaves(v, path));
  }
  return out;
}

const byLocale = Object.fromEntries(LOCALES.map((l) => [l, leaves(load(l))])) as Record<
  string,
  Record<string, string>
>;

const baseKeys = (keys: string[]) => new Set(keys.map((k) => k.replace(PLURAL_SUFFIX, '')));

describe('celpip i18n namespace', () => {
  it('every locale carries the same base keys', () => {
    const en = baseKeys(Object.keys(byLocale.en));
    for (const locale of LOCALES.slice(1)) {
      const other = baseKeys(Object.keys(byLocale[locale]));
      const missing = [...en].filter((k) => !other.has(k));
      const extra = [...other].filter((k) => !en.has(k));
      expect({ locale, missing, extra }).toEqual({ locale, missing: [], extra: [] });
    }
  });

  it('every plural key has an `_other` fallback, which i18next requires', () => {
    for (const locale of LOCALES) {
      const keys = Object.keys(byLocale[locale]);
      const pluralBases = new Set(
        keys.filter((k) => PLURAL_SUFFIX.test(k)).map((k) => k.replace(PLURAL_SUFFIX, '')),
      );
      for (const base of pluralBases) {
        expect(keys, `${locale}: ${base} has no _other`).toContain(`${base}_other`);
      }
    }
  });

  it('no ICU syntax survived the conversion from next-intl', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(byLocale[locale])) {
        expect(value, `${locale}.${key}`).not.toMatch(/,\s*(plural|select)\s*,/);
        // A lone `{var}` would render literally under i18next.
        expect(value, `${locale}.${key}`).not.toMatch(/(?<!\{)\{\w+\}(?!\})/);
      }
    }
  });

  it('interpolation placeholders match across locales', () => {
    const phOf = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const locale of LOCALES.slice(1)) {
      for (const [key, en] of Object.entries(byLocale.en)) {
        const other = byLocale[locale][key];
        if (other === undefined) continue;
        // Arabic's `_one` form is a whole word and legitimately drops `{{count}}`.
        if (locale === 'ar' && key.endsWith('_one')) continue;
        expect(phOf(other), `${locale}.${key}`).toEqual(phOf(en));
      }
    }
  });

  it('carries an error code for every failure desk can surface', () => {
    const required = [
      // backend
      'INSUFFICIENT_PARTS',
      'EXAM_COOLDOWN',
      'NO_SECTIONS_SELECTED',
      'EXAM_ALREADY_COMPLETE',
      'SECTIONS_INCOMPLETE',
      'SCORING_FAILED',
      'EXAM_INSIGHT_LIMIT_REACHED',
      'EXAM_VOCAB_LIMIT_REACHED',
      'EXAM_VOCAB_NOT_READY',
      'INSIGHT_GENERATING',
      'INSIGHT_SUMMARY_NOT_READY',
      'INSIGHT_GENERATION_FAILED',
      'INVALID_SKILL',
      'UNAUTHORIZED',
      'UNKNOWN_ERROR',
      // on-device model
      'MODEL_RETURNED_NO_JSON',
      'OLLAMA_NOT_RUNNING',
      // native recorder
      'WHISPER_NOT_CONFIGURED',
      'RECORDING_ALREADY_ACTIVE',
      'NO_ACTIVE_RECORDING',
      'RECORDING_NOT_FOUND',
      'EMPTY_RECORDING',
      'MIC_PERMISSION_DENIED',
      'UPLOAD_FAILED',
    ];
    for (const locale of LOCALES) {
      for (const code of required) {
        expect(byLocale[locale][`errors.${code}`], `${locale} missing errors.${code}`).toBeTruthy();
      }
    }
  });

  it('non-English locales are actually translated, not English copies', () => {
    for (const locale of ['fa', 'ar', 'hi', 'zh'] as const) {
      const copied = Object.entries(byLocale.en)
        .filter(([k, en]) => byLocale[locale][k] === en)
        // Proper nouns, abbreviations and pure-numeric labels legitimately match.
        .filter(([, en]) => en.length > 12 && /[a-zA-Z]{4}/.test(en))
        .map(([k]) => k);
      expect({ locale, copied: copied.slice(0, 5) }).toEqual({ locale, copied: [] });
    }
  });
});
