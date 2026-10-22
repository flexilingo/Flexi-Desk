import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { errorCode } from './deckCloud';

/** Turn anything thrown into a sentence in the learner's language (UNKNOWN_ERROR when unmapped). */
export function useErrorText(): (err: unknown) => string {
  const { t, i18n } = useTranslation('decks');
  return useCallback(
    (err: unknown) => {
      const code = errorCode(err);
      return i18n.exists(`decks:errors.${code}`) ? t(`errors.${code}`) : t('errors.UNKNOWN_ERROR');
    },
    [t, i18n],
  );
}
