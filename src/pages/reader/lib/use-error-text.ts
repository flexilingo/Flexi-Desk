import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** The code in whatever a local command or a cloud call rejected with, if it has one. */
export function errorCodeOf(cause: unknown): string {
  if (typeof cause === 'string' && /^[A-Z][A-Z0-9_]+$/.test(cause)) return cause;
  if (cause && typeof cause === 'object') {
    const code =
      (cause as { code?: unknown; error?: unknown }).code ?? (cause as { error?: unknown }).error;
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(code)) return code;
  }
  return 'UNKNOWN_ERROR';
}

/** An error code shown translated, with `UNKNOWN_ERROR` as the fallback — never silent. */
export function useReaderErrorText() {
  const { t, i18n } = useTranslation('readerDesk');
  return useCallback(
    (cause: unknown) => {
      const key = `errors.${errorCodeOf(cause)}`;
      return i18n.exists(key, { ns: 'readerDesk' }) ? t(key) : t('errors.UNKNOWN_ERROR');
    },
    [t, i18n],
  );
}
