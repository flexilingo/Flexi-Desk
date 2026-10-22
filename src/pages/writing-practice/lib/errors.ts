import type { TFunction } from 'i18next';
import { errorCodeOf } from './session';

/** A translated sentence for a failure; unknown codes fall back to UNKNOWN_ERROR. */
export function writingErrorText(t: TFunction<'writingPractice'>, err: unknown): string {
  const code = errorCodeOf(err);
  return code && t(`errors.${code}`, { defaultValue: '' })
    ? t(`errors.${code}`)
    : t('errors.UNKNOWN_ERROR');
}
