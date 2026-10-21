/**
 * Target-language config for the Add-to-Deck translation picker.
 *
 * Desk forbids flag emojis (see CLAUDE.md — Lucide icons / plain text only),
 * so unlike flexi-lingo-front there is no `flag` field. The UI shows the
 * language `code` in a small monospace chip instead.
 */

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

export const targetLanguages: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', dir: 'rtl' },
];

export function getLanguageByCode(code: string): LanguageOption | undefined {
  return targetLanguages.find((l) => l.code === code);
}

export function getLanguageName(code: string): string {
  return getLanguageByCode(code)?.name ?? code.toUpperCase();
}

export function getLanguageDirection(code: string): 'ltr' | 'rtl' {
  return getLanguageByCode(code)?.dir ?? 'ltr';
}
