/**
 * Parse errors thrown by Tauri cloud commands (`supabase_call` and friends).
 *
 * The Rust side rejects with a JSON-stringified object:
 *   {"status":401,"error":"Authentication required","code":"","data":{...}}
 * but plain string errors also occur (network failures, auth command codes).
 * Never render the raw string to the user — parse it here first.
 */

export interface CloudError {
  status: number | null;
  code: string;
  message: string;
}

const CODE_RE = /^[A-Z0-9_]+$/;

export function parseCloudError(err: unknown): CloudError {
  const raw =
    typeof err === 'string' ? err : err instanceof Error ? err.message : String(err ?? '');

  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as Record<string, unknown>;
      const status = typeof parsed.status === 'number' ? parsed.status : null;
      const error = typeof parsed.error === 'string' ? parsed.error : '';
      const explicitCode = typeof parsed.code === 'string' ? parsed.code : '';
      const code = explicitCode || (CODE_RE.test(error) ? error : '');
      const message =
        error || (typeof parsed.message === 'string' ? parsed.message : '') || 'Request failed';
      return { status, code, message };
    } catch {
      // not JSON after all — fall through to the plain-string path
    }
  }

  const trimmed = raw.trim();
  return {
    status: null,
    code: CODE_RE.test(trimmed) ? trimmed : '',
    message: trimmed || 'Request failed',
  };
}

/** True when the failure means "you need to sign in" (missing/expired session). */
export function isAuthError(e: CloudError): boolean {
  return e.status === 401 || /authentication required/i.test(e.message);
}

/** Human-readable fallback text for a parsed cloud error. */
export function cloudErrorText(e: CloudError): string {
  if (isAuthError(e)) return 'You need to sign in to use this feature.';
  if (e.status && e.status >= 500) return 'The server had a problem. Please try again in a moment.';
  if (/error sending request|Failed to send|network|timed? ?out/i.test(e.message)) {
    return 'Could not reach FlexiLingo. Check your internet connection and try again.';
  }
  // Codes are SCREAMING_SNAKE_CASE — turn them into a readable sentence.
  if (e.code && e.code === e.message) {
    const readable = e.code.toLowerCase().replace(/_/g, ' ');
    return readable.charAt(0).toUpperCase() + readable.slice(1) + '.';
  }
  return e.message;
}
