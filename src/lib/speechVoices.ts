/**
 * Which cloud voice reads which language. Mirrors the website's
 * `pronunciationVoice.ts` and the MICROSOFT_VOICES table in the `text-to-speech-v2`
 * edge function — keep them in step.
 */

/** Languages with more than one regional voice; the first is the default. */
const REGIONAL_VOICES: Record<string, readonly string[]> = {
  en: ['en-US', 'en-GB', 'en-AU', 'en-IN'],
  fr: ['fr-FR', 'fr-CA'],
  es: ['es-ES', 'es-US'],
  pt: ['pt-BR', 'pt-PT'],
  zh: ['zh-CN', 'zh-TW'],
};

/** Languages with one voice: our code is also the key into MICROSOFT_VOICES. */
const SINGLE_VOICE = new Set(['de', 'it', 'ru', 'ja', 'ko', 'ar', 'hi', 'tr', 'fa']);

/** Microsoft's voice per region: [female, male]. */
const MICROSOFT_VOICES: Record<string, readonly [string, string]> = {
  'en-US': ['en-US-AvaNeural', 'en-US-AndrewNeural'],
  'en-GB': ['en-GB-SoniaNeural', 'en-GB-RyanNeural'],
  'en-AU': ['en-AU-NatashaNeural', 'en-AU-WilliamMultilingualNeural'],
  'en-IN': ['en-IN-NeerjaNeural', 'en-IN-PrabhatNeural'],
  'fr-FR': ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
  'fr-CA': ['fr-CA-SylvieNeural', 'fr-CA-ThierryNeural'],
  'es-ES': ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
  'es-US': ['es-US-PalomaNeural', 'es-US-AlonsoNeural'],
  'pt-BR': ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'],
  'pt-PT': ['pt-PT-RaquelNeural', 'pt-PT-DuarteNeural'],
  'zh-CN': ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'],
  'zh-TW': ['zh-TW-HsiaoChenNeural', 'zh-TW-YunJheNeural'],
  de: ['de-DE-KatjaNeural', 'de-DE-ConradNeural'],
  it: ['it-IT-ElsaNeural', 'it-IT-DiegoNeural'],
  ru: ['ru-RU-SvetlanaNeural', 'ru-RU-DmitryNeural'],
  ja: ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
  ko: ['ko-KR-SunHiNeural', 'ko-KR-InJoonNeural'],
  ar: ['ar-SA-ZariyahNeural', 'ar-SA-HamedNeural'],
  hi: ['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural'],
  tr: ['tr-TR-EmelNeural', 'tr-TR-AhmetNeural'],
  fa: ['fa-IR-DilaraNeural', 'fa-IR-FaridNeural'],
};

/** Languages the server's own voice serves when Microsoft's does not answer. */
const OWN_VOICE_LANGUAGES = new Set([
  'en',
  'fa',
  'fr',
  'es',
  'de',
  'it',
  'pt',
  'ru',
  'ja',
  'ko',
  'zh',
  'ar',
  'hi',
  'tr',
]);

/** `en`, `en-GB`, `pt_BR` -> the bare language code. */
export function baseLanguage(lang: string | undefined | null): string {
  return (lang ?? 'en').trim().replace('_', '-').split('-')[0].toLowerCase() || 'en';
}

/** The key into MICROSOFT_VOICES for a language, honouring an explicit region or English accent. */
export function regionFor(lang: string | undefined | null, accent?: string): string | null {
  const base = baseLanguage(lang);
  const tag = (lang ?? '').trim().replace('_', '-');
  const regional = REGIONAL_VOICES[base];
  if (!regional) return SINGLE_VOICE.has(base) ? base : null;
  const exact = regional.find((r) => r.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;
  if (base === 'en' && accent === 'uk') return 'en-GB';
  return regional[0];
}

export function microsoftVoiceFor(region: string | null): string | null {
  return region && MICROSOFT_VOICES[region] ? MICROSOFT_VOICES[region][0] : null;
}

export function ownVoiceServes(lang: string | undefined | null): boolean {
  return OWN_VOICE_LANGUAGES.has(baseLanguage(lang));
}

/** Server cap is 500 characters a request; chunks stay under it. */
export const CLOUD_CHUNK_CHARS = 440;

/** Splits on sentence ends (then spaces) so each piece fits one request. */
export function chunkText(text: string, limit = CLOUD_CHUNK_CHARS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean ? [clean] : [];
  const out: string[] = [];
  let rest = clean;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('। '),
      window.lastIndexOf('。'),
    );
    if (cut < limit / 3) cut = window.lastIndexOf(' ');
    if (cut < limit / 3) cut = limit - 1;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Request paths to try, best first: Microsoft's natural voice, then the server's own. */
export function cloudPaths(text: string, lang: string | undefined, accent?: string): string[] {
  const base = baseLanguage(lang);
  const q = `text=${encodeURIComponent(text)}&language=${encodeURIComponent(base)}`;
  const paths: string[] = [];
  const voice = microsoftVoiceFor(regionFor(lang, accent));
  if (voice)
    paths.push(`/text-to-speech-v2?${q}&engine=microsoft&voice=${encodeURIComponent(voice)}`);
  if (ownVoiceServes(lang))
    paths.push(`/text-to-speech-v2?${q}&accent=${accent === 'uk' ? 'uk' : 'us'}`);
  return paths;
}
