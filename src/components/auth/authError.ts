import i18n from 'i18next';
import { parseCloudError, cloudErrorText } from '@/lib/cloudError';

const AUTH_ERROR_CODES = [
  'SEND_OTP_FAILED',
  'VERIFY_OTP_FAILED',
  'INVALID_OTP',
  'OTP_EXPIRED',
  'RATE_LIMITED',
];

export function authErrorText(err: unknown): string {
  const parsed = parseCloudError(err);
  if (AUTH_ERROR_CODES.includes(parsed.code)) return i18n.t(`authDesk:errors.${parsed.code}`);
  return cloudErrorText(parsed);
}

/** The code a Google sign-in failure carries (`GOOGLE_*`), or a generic one. */
export function googleErrorKey(err: unknown): string {
  const { code, message } = parseCloudError(err);
  const raw = code || message;
  const m = /GOOGLE_[A-Z_]+/.exec(raw);
  const known = [
    'GOOGLE_CANCELLED',
    'GOOGLE_TIMEOUT',
    'GOOGLE_STATE_MISMATCH',
    'GOOGLE_NOT_CONFIGURED',
    'GOOGLE_OPEN_FAILED',
    'GOOGLE_LISTEN_FAILED',
    'GOOGLE_TOKEN_FAILED',
    'GOOGLE_SIGN_IN_FAILED',
  ];
  return m && known.includes(m[0]) ? m[0] : 'GOOGLE_SIGN_IN_FAILED';
}
