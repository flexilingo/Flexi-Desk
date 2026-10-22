import { targetLanguages as deskTargetLanguages, type LanguageOption } from '@/config/languages';

export type { LanguageOption };

/** Languages a word can be looked up IN (what the translation backend reads). */
export const sourceLanguages: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', dir: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', dir: 'ltr' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr' },
];

/** Languages a word is translated INTO. */
export const targetLanguages: LanguageOption[] = deskTargetLanguages;

const RTL = new Set(['ar', 'fa', 'he', 'ur']);
export function directionOf(code: string): 'ltr' | 'rtl' {
  return RTL.has(code) ? 'rtl' : 'ltr';
}
