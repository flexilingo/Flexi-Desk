/**
 * Which language a card's text is read in. The deck is the authority for the word
 * (so a French deck is read in French, not in English because "bonjour" is Latin
 * letters); the meaning is read in the language it is written in. Every language
 * the voice module can speak is allowed — nothing is left silent.
 */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const FA_ONLY_LETTERS = /[\u067E\u0686\u0698\u06AF\u06CC]/; // letters only one of the two Arabic-script languages uses
const CJK = /[\u3040-\u30FF\u3400-\u9FFF]/;
const HANGUL = /[\uAC00-\uD7AF]/;
const DEVANAGARI = /[\u0900-\u097F]/;
const CYRILLIC = /[\u0400-\u04FF]/;
const LATIN = /[A-Za-z\u00C0-\u024F]/;

export const baseLang = (code: string | null | undefined): string =>
  (code ?? '').trim().replace('_', '-').split('-')[0].toLowerCase();

export const hasRtl = (text: string): boolean =>
  ARABIC_SCRIPT.test(text) || /[\u0590-\u05FF]/.test(text);

/** The language a text is written in, judged by its script alone; `null` for Latin (many languages share it). */
export function scriptLanguage(text: string): string | null {
  if (ARABIC_SCRIPT.test(text)) return FA_ONLY_LETTERS.test(text) ? 'fa' : 'ar';
  if (HANGUL.test(text)) return 'ko';
  if (CJK.test(text)) return /[\u3040-\u30FF]/.test(text) ? 'ja' : 'zh';
  if (DEVANAGARI.test(text)) return 'hi';
  if (CYRILLIC.test(text)) return 'ru';
  return null;
}

export interface CardLangInput {
  /** `notes.learning_lang`, when the card names it. */
  notesLang?: string | null;
  deckLanguage?: string | null;
}

/** The language of a card's front: its own declaration, then the deck's, then the script, then English. */
export function frontLanguage({ notesLang, deckLanguage }: CardLangInput, front = ''): string {
  return baseLang(notesLang) || baseLang(deckLanguage) || scriptLanguage(front) || 'en';
}

/**
 * The language to read a meaning in: the deck's native language, else the learner's;
 * but never a voice that cannot read the text's script (a Arabic-script meaning on a deck
 * whose pair says English is read in that script's own language), and Latin text under a non-Latin
 * native language is read as English.
 */
export function meaningLanguage(
  back: string,
  deckNative: string | null | undefined,
  appNative: string | null | undefined,
): string {
  const scripted = scriptLanguage(back);
  const preferred = baseLang(deckNative) || baseLang(appNative) || 'en';
  if (scripted) {
    // Same script family: keep the preferred voice (ar vs fa, zh vs ja are told apart by the deck).
    const sameFamily =
      (['ar', 'fa'].includes(scripted) && ['ar', 'fa'].includes(preferred)) ||
      (['zh', 'ja'].includes(scripted) && ['zh', 'ja'].includes(preferred)) ||
      scripted === preferred;
    return sameFamily ? preferred : scripted;
  }
  if (!LATIN.test(back)) return preferred;
  return ['ar', 'fa', 'zh', 'ja', 'ko', 'hi', 'ru'].includes(preferred) ? 'en' : preferred;
}

/** A language's name in the UI language ("French", "français"); `null` when it cannot be named. */
export function languageName(code: string | null | undefined, uiLanguage: string): string | null {
  const base = baseLang(code);
  if (!base) return null;
  try {
    const name = new Intl.DisplayNames([uiLanguage || 'en'], { type: 'language' }).of(base);
    return name && name.toLowerCase() !== base ? name : null;
  } catch {
    return null;
  }
}
