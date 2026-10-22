import type { SpeechPreference } from '@/lib/speech';

export type Engine = 'microsoft' | 'google' | 'flexilingo' | 'device';

/**
 * The website lists four voices; the desk has two real engines (the cloud voice, which
 * is Microsoft's natural voice and then our own, and the device voice). Natural,
 * Google and FlexiLingo all pick the cloud voice here; the choice is still saved to the
 * account so the website and the extension follow it.
 */
export function engineToPreference(engine: Engine): SpeechPreference {
  return engine === 'device' ? 'device' : 'cloud';
}

/** What to show as picked from the desk's own preference when there is no account value. */
export function preferenceToEngine(pref: SpeechPreference): Engine {
  return pref === 'device' || pref === 'system' ? 'device' : 'microsoft';
}
