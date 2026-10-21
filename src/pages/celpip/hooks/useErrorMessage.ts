import { useTranslation } from 'react-i18next';

/**
 * Resolves a backend error CODE to a sentence.
 *
 * Both the `/exam` edge function and desk's own Rust commands answer with
 * SCREAMING_SNAKE_CASE codes (`EXAM_COOLDOWN`, `WHISPER_NOT_CONFIGURED`, …), so a
 * single lookup covers both. Anything unrecognised falls back to `UNKNOWN_ERROR`
 * rather than leaking a raw code at the user.
 */
export function useErrorMessage() {
  const { t, i18n } = useTranslation('celpip');

  return (code: string | null | undefined): string | null => {
    if (!code) return null;
    const key = `errors.${code}`;
    return i18n.exists(`celpip:${key}`) ? t(key) : t('errors.UNKNOWN_ERROR');
  };
}
