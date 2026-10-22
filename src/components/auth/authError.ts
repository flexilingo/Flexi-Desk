import { parseCloudError, cloudErrorText } from '@/lib/cloudError';

// Friendly copy for the auth command error codes coming back from Rust.
const AUTH_ERROR_TEXT: Record<string, string> = {
  SEND_OTP_FAILED: 'Could not send the code. Check the email address and try again.',
  VERIFY_OTP_FAILED: 'That code did not work. Check it and try again.',
  INVALID_OTP: 'That code is not valid. Check it and try again.',
  OTP_EXPIRED: 'That code has expired. Request a new one.',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
};

export function authErrorText(err: unknown): string {
  const parsed = parseCloudError(err);
  return AUTH_ERROR_TEXT[parsed.code] ?? cloudErrorText(parsed);
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
