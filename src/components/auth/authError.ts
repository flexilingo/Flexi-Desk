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
