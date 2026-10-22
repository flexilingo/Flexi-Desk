import i18n from 'i18next';
import { parseCloudError } from '@/lib/cloudError';

/** Error codes the tutor and caption screens translate (`<ns>:errors.<CODE>`). */
const PATTERNS: [string, RegExp][] = [
  ['AUTH_REQUIRED', /authentication required|not signed in|\b401\b/i],
  ['NETWORK_ERROR', /error sending request|failed to send|network|timed? ?out|connection|dns/i],
  ['MIC_UNAVAILABLE', /microphone|input device|audio input|no default input|permission denied/i],
  ['MODEL_MISSING', /model.*(not found|missing|not downloaded)|no (whisper )?model/i],
];

/**
 * Map a thrown backend/Rust error to translated text. Codes (`SOME_CODE`) win,
 * then known message patterns, then `UNKNOWN_ERROR`. The raw text goes to the
 * console only, never to the screen.
 */
export function localErrorText(err: unknown, ns: 'tutor' | 'caption'): string {
  const parsed = parseCloudError(err);
  console.error(`[${ns}]`, err);
  const known = (code: string) => (i18n.exists(`${ns}:errors.${code}`) ? code : '');
  let code = parsed.code ? known(parsed.code) : '';
  if (!code) {
    const hit = PATTERNS.find(([, re]) => re.test(parsed.message));
    code = hit ? known(hit[0]) : '';
  }
  return i18n.t(`${ns}:errors.${code || 'UNKNOWN_ERROR'}`);
}
