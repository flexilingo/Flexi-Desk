import type { TFunction } from 'i18next';

const KNOWN = [
  'OLLAMA_NOT_RUNNING',
  'OLLAMA_MODEL_MISSING',
  'AI_KEY_MISSING',
  'AI_NOT_READY',
] as const;

/** A friendly, translated sentence for any failure of the user's AI. */
export function aiErrorText(t: TFunction<'ai'>, err: unknown): string {
  const text = String(err);
  const code = KNOWN.find((c) => text.includes(c));
  if (code) return t(`errors.${code}`);
  if (/\((401|403)[ )]/.test(text) || /invalid.*(key|auth)|unauthorized/i.test(text))
    return t('errors.AI_KEY_REJECTED');
  if (/\(429[ )]/.test(text)) return t('errors.AI_RATE_LIMITED');
  if (/error sending request|request failed|dns|connect|network/i.test(text))
    return t('errors.AI_UNREACHABLE');
  return t('errors.UNKNOWN_ERROR');
}
