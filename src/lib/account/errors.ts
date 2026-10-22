import { parseCloudError } from '@/lib/cloudError';

/**
 * A backend error as a sentence in the learner's language: the code resolves through
 * `account:errors.<CODE>` (the website's error table), anything else is
 * `UNKNOWN_ERROR`. `t` is i18next's `t` for the `account` namespace.
 */
export function accountErrorText(
  err: unknown,
  t: (key: string) => string,
  exists: (key: string) => boolean,
): string {
  const { code } = parseCloudError(err);
  if (code && exists(`errors.${code}`)) return t(`errors.${code}`);
  return t('errors.UNKNOWN_ERROR');
}

/** True when the failure means there is no (valid) session. */
export function isSignedOutError(err: unknown): boolean {
  const e = parseCloudError(err);
  return e.status === 401 || /authentication required/i.test(e.message);
}
