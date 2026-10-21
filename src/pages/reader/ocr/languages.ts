/**
 * A document's language (ISO 639-1, as the desk stores it) -> the tesseract
 * traineddata code the on-device OCR reads it with.
 *
 * Every code here exists in tessdata `4.0.0_best_int` (the set the engine
 * downloads from). A language not listed is read as English and SAYS so
 * (`fallback`), instead of failing: a page of Latin letters still comes out
 * mostly right, and an unreadable scan is worse than an approximate one.
 */
const MAP: Record<string, string> = {
  en: 'eng',
  fr: 'fra',
  es: 'spa',
  de: 'deu',
  it: 'ita',
  pt: 'por',
  nl: 'nld',
  ru: 'rus',
  uk: 'ukr',
  pl: 'pol',
  cs: 'ces',
  ro: 'ron',
  hu: 'hun',
  sv: 'swe',
  da: 'dan',
  fi: 'fin',
  no: 'nor',
  nb: 'nor',
  el: 'ell',
  tr: 'tur',
  vi: 'vie',
  id: 'ind',
  th: 'tha',
  he: 'heb',
  ja: 'jpn',
  ko: 'kor',
  zh: 'chi_sim',
  ar: 'ara',
  fa: 'fas',
  ur: 'urd',
  hi: 'hin',
  bn: 'ben',
  ta: 'tam',
};

export const FALLBACK_OCR_LANGUAGE = 'eng';

export interface OcrLanguage {
  /** The traineddata code, e.g. `fra`. */
  code: string;
  /** The ISO code it was asked for, normalised (`fr`). */
  iso: string;
  /** True when the language is not in the map and English is used instead. */
  fallback: boolean;
}

/** `fr`, `FR`, `fr-CA`, `fr_CA` -> `fr`; `zh-TW` / `zh-Hant` -> traditional Chinese. */
export function ocrLanguageFor(language: string | null | undefined): OcrLanguage {
  const raw = (language ?? '').trim().toLowerCase().replace(/_/g, '-');
  const iso = raw.split('-')[0] ?? '';
  if (iso === 'zh' && /^zh-(tw|hk|mo|hant)/.test(raw)) {
    return { code: 'chi_tra', iso: 'zh', fallback: false };
  }
  const code = MAP[iso];
  if (code) return { code, iso, fallback: false };
  return { code: FALLBACK_OCR_LANGUAGE, iso: iso || 'en', fallback: iso !== '' && iso !== 'en' };
}
