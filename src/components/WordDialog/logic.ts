import { parseCloudError } from '@/lib/cloudError';
import type { LanguageOption } from './languages';
import { sourceLanguages, targetLanguages } from './languages';
import type { WordDialogTab } from './types';

/** Where a lookup is answered: FlexiLingo's cloud (signed in) or on this machine. */
export type LookupOrigin = 'cloud' | 'local';

const CLOUD_SOURCES = new Set(sourceLanguages.map((l) => l.code));
const CLOUD_TARGETS = new Set(targetLanguages.map((l) => l.code));

/**
 * Signed in and a pair the backend reads -> the cloud (cache, curated word data,
 * the vocabulary history). Anything else -> the local Google path, which reads any pair.
 */
export function chooseLookupOrigin(args: {
  signedIn: boolean;
  source: string;
  target: string;
}): LookupOrigin {
  return args.signedIn && CLOUD_SOURCES.has(args.source) && CLOUD_TARGETS.has(args.target)
    ? 'cloud'
    : 'local';
}

/**
 * The language the word is in. The language of the text the word was met in
 * (document, episode, deck) always wins; the reader's learning language is the
 * fallback; English the floor.
 */
export function resolveSourceLanguage(args: {
  explicit?: string | null;
  learning?: string | null;
}): string {
  return args.explicit || args.learning || 'en';
}

/**
 * The pair a word in `lang` is read in. A word in the translation's language is
 * read back into the word's own (English to French makes "detriment" French to
 * English). Null when the backend cannot read that pair.
 */
export function pairFor(
  lang: string,
  ctx: {
    source: string;
    target: string | null;
    knownSources?: LanguageOption[];
    knownTargets?: LanguageOption[];
  },
): { source: string; target: string } | null {
  if (!ctx.target) return null;
  const target = lang === ctx.target ? ctx.source : ctx.target;
  if (lang === target) return null;
  const sources = ctx.knownSources ?? sourceLanguages;
  const targets = ctx.knownTargets ?? targetLanguages;
  if (!sources.some((l) => l.code === lang) || !targets.some((l) => l.code === target)) return null;
  return { source: lang, target };
}

/** Free Dictionary and Merriam-Webster are English dictionaries: other languages get Translate and AI only. */
export function tabsFor(source: string): WordDialogTab[] {
  return source === 'en' ? ['google', 'ai', 'dictionary', 'merriam-webster'] : ['google', 'ai'];
}

/** A remembered English-only tab on a non-English word falls back to Translate. */
export function effectiveTab(tab: WordDialogTab, source: string): WordDialogTab {
  return tabsFor(source).includes(tab) ? tab : 'google';
}

/** "storm (a violent weather event)" -> the word and its gloss. Anything else is shown as it came. */
export function splitTranslation(text: string): { main: string; note: string | null } {
  const match = text.trim().match(/^([^()（）]+?)\s*[(（]([^()（）]+)[)）]$/);
  return match ? { main: match[1], note: match[2] } : { main: text, note: null };
}

/** A phrase (a dragged sentence) gets smaller type than a single word. */
export const isPhrase = (word: string): boolean => /\s/.test(word.trim());

/** The key an answer is stored under, so a level never shows another level's answer. */
export function lookupKeyFor(args: {
  word: string;
  context?: string;
  source: string;
  target: string | null;
}): string | null {
  return args.target
    ? [args.word, args.context ?? '', args.target, args.source].join('\u0000')
    : null;
}

/** Speakers shown beside the word: the learner's own voice first, then one to compare. */
export interface DialogSpeaker {
  /** Short label on the button. */
  label: string;
  /** The exact voice region this speaker reads (BCP-47), e.g. fr-CA. */
  voice: string;
}

/** Regional voices per language. The first is the default. Languages absent here have ONE voice. */
export const REGIONAL_VOICES: Record<string, readonly string[]> = {
  en: ['en-US', 'en-GB', 'en-AU', 'en-IN'],
  fr: ['fr-FR', 'fr-CA'],
  es: ['es-ES', 'es-US'],
  pt: ['pt-BR', 'pt-PT'],
  zh: ['zh-CN', 'zh-TW'],
};

const VOICE_LABEL: Record<string, string> = {
  'en-US': 'US',
  'en-GB': 'UK',
  'en-AU': 'AU',
  'en-IN': 'IN',
  'fr-FR': 'FR',
  'fr-CA': 'CA',
  'es-ES': 'ES',
  'es-US': 'LATAM',
  'pt-BR': 'BR',
  'pt-PT': 'PT',
  'zh-CN': 'CN',
  'zh-TW': 'TW',
};

/**
 * The speakers for a word in `language`. Only a language that HAS regions gets
 * two: English US/UK, French France/Canada, Spanish, Portuguese, Chinese. Every
 * other language gets one button labelled with its own code - never US/UK for
 * a French word.
 */
export function dialogSpeakers(language: string, ownVoice?: string | null): DialogSpeaker[] {
  const regional = REGIONAL_VOICES[language];
  if (!regional) return [{ label: language.toUpperCase(), voice: language }];
  const own = ownVoice && regional.includes(ownVoice) ? ownVoice : regional[0];
  const other =
    language === 'en'
      ? own === 'en-GB'
        ? 'en-US'
        : 'en-GB'
      : (regional.find((v) => v !== own) ?? own);
  return [own, other].map((voice) => ({ label: VOICE_LABEL[voice] ?? voice, voice }));
}

/** The SCREAMING_SNAKE code behind a thrown lookup error, or a safe fallback. */
export function errorCodeOf(err: unknown): string {
  const { code, message } = parseCloudError(err);
  if (/^[A-Z][A-Z0-9_]{2,63}$/.test(code)) return code;
  // Before the network check: "AI_TIMEOUT" would otherwise read as a timed-out connection.
  const own = /OLLAMA_NOT_RUNNING|OLLAMA_MODEL_MISSING|AI_KEY_MISSING|AI_TIMEOUT|AI_CANCELLED/;
  if (own.test(message)) return message.match(own)![0];
  if (/error sending request|failed to send|network|timed? ?out|offline|dns/i.test(message))
    return 'NETWORK_ERROR';
  return 'UNKNOWN_ERROR';
}
