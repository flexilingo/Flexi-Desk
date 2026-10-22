/** The app's languages; sentences are explained in the learner's own when written, English until then. */
export const UI_LOCALES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh'] as const;

export const baseLocale = (language: string | undefined): string => {
  const base = (language ?? 'en').toLowerCase().split('-')[0];
  return (UI_LOCALES as readonly string[]).includes(base) ? base : 'en';
};
