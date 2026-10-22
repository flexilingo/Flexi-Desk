/**
 * Whether two words are forms of one another: "differences" and "difference",
 * "running" and "run", "maux" and "mal", "parlons" and "parler".
 *
 * There is no dictionary behind this. Each word is cut down to the stems its
 * regular endings allow, and two words match when they share one. That is
 * enough to mark the word a reader is looking at inside an example; an
 * irregular form ("went", "suis") needs a real table, which callers pass in
 * as extra forms (the word dialog does, for French verbs).
 */

type Rule = [suffix: string, replacement: string];

const strip = (...suffixes: string[]): Rule[] => suffixes.map((s) => [s, '']);

/** Regular endings per language, longest first where it matters. */
const RULES: Record<string, Rule[]> = {
  en: [
    ["'s", ''],
    ['ies', 'y'],
    ['ied', 'y'],
    ['ing', 'e'],
    ['ed', 'e'],
    ...strip('ing', 'ed', 'es', 's', 'e'),
  ],
  fr: [
    ['eaux', 'eau'],
    ['aux', 'al'],
    ...strip(
      'issaient',
      'issions',
      'issiez',
      'issons',
      'issez',
      'issent',
      'issait',
      'issais',
      'issant',
      'aient',
      'erons',
      'eront',
      'erez',
      'erai',
      'eras',
      'era',
      'ions',
      'iez',
      'ons',
      'ez',
      'ent',
      'ais',
      'ait',
      'ant',
      'ees',
      'es',
      'ee',
      'er',
      'ir',
      're',
      'ai',
      'it',
      'is',
      'e',
      's',
      'x',
    ),
  ],
  es: strip(
    'iendo',
    'ando',
    'amos',
    'emos',
    'imos',
    'ado',
    'ada',
    'ido',
    'ida',
    'es',
    'os',
    'as',
    'ar',
    'er',
    'ir',
    'an',
    'en',
    's',
    'a',
    'o',
    'e',
  ),
  pt: strip(
    'ando',
    'endo',
    'indo',
    'amos',
    'emos',
    'imos',
    'ado',
    'ido',
    'es',
    'os',
    'as',
    'ar',
    'er',
    'ir',
    'am',
    'em',
    's',
    'a',
    'o',
  ),
  it: strip(
    'ando',
    'endo',
    'iamo',
    'are',
    'ere',
    'ire',
    'ato',
    'ata',
    'uto',
    'ito',
    'ano',
    'ono',
    'ate',
    'ete',
    'ite',
    'i',
    'e',
    'a',
    'o',
  ),
  de: strip('ten', 'en', 'er', 'es', 'st', 'te', 'et', 'e', 'n', 's', 't'),
};

/** French and Italian glue an article or pronoun on: "l'homme", "dell'acqua". */
const ELISION = /^(?:qu|jusqu|lorsqu|puisqu|dell|nell|sull|dall|[cdjlmnst])'/;

const MIN_STEM = 3;

/** Lower case, one apostrophe, and no accents: "Lève" and "lever" share "lev". */
export function foldWord(word: string): string {
  return word.toLowerCase().replace(/’/g, "'").normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Every stem `word` can be cut down to by one regular ending, itself included. */
export function stemsOf(word: string, lang: string): Set<string> {
  const base = foldWord(word).replace(ELISION, '');
  const stems = new Set([base]);
  for (const [suffix, replacement] of RULES[lang] ?? []) {
    if (!base.endsWith(suffix)) continue;
    // "class" is not the plural of "clas".
    if (lang === 'en' && suffix === 's' && base.endsWith('ss')) continue;
    const stem = base.slice(0, base.length - suffix.length) + replacement;
    if (stem.length < MIN_STEM) continue;
    stems.add(stem);
    // running → runn → run, stopped → stopp → stop.
    if (lang === 'en' && /([b-df-hj-np-tv-z])\1$/.test(stem)) stems.add(stem.slice(0, -1));
  }
  return stems;
}

/**
 * A matcher for one word and its forms. The first of `words` is the word
 * itself and matches in every regular form; the rest are forms no ending rule
 * reaches (a French verb's conjugation) and match only as written — cut down to
 * stems, être's "sommes" would also mark the noun "somme". A form with a space
 * in it is skipped here: the caller matches phrases itself.
 */
export function formMatcher(words: readonly string[], lang: string): (token: string) => boolean {
  // Accents are kept for the exact match: avoir's "a" is not the preposition "à".
  const asWritten = (w: string) =>
    w
      .toLowerCase()
      .replace(/\u2019/g, "'")
      .replace(ELISION, '');
  const exact = new Set<string>();
  const stems = new Set<string>();
  words.forEach((w, i) => {
    if (!w || /\s/.test(w.trim())) return;
    exact.add(asWritten(w.trim()));
    if (i === 0) stemsOf(w.trim(), lang).forEach((s) => stems.add(s));
  });
  return (token: string) => {
    if (!token) return false;
    if (exact.has(asWritten(token))) return true;
    // Short words match only as written: "us" is not "use".
    if (foldWord(token).replace(ELISION, '').length < MIN_STEM) return false;
    for (const stem of stemsOf(token, lang)) if (stems.has(stem)) return true;
    return false;
  };
}
