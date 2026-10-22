import { invoke } from '@tauri-apps/api/core';
import { supabaseCall } from '@/lib/supabase';
import { parseCloudError } from '@/lib/cloudError';
import { errorCodeOf } from './logic';
import type {
  AIWordAnalysis,
  DictionaryEntry,
  DictionaryResponse,
  WordDetails,
  WordGrammarResponse,
} from './types';

/** Shape of the Rust command `podcast_translate_word` (Google, on this machine). */
interface RawLocalTranslation {
  word: string;
  translation: string;
  alternatives: { pos: string; words: string[] }[];
  examples: string[];
  cefr_level: string | null;
}

/** Local Google result -> the dialog's one shape. CEFR comes from the SOURCE language's own table. */
export function fromLocalTranslation(raw: RawLocalTranslation): WordDetails {
  const alt = new Set<string>();
  for (const group of raw.alternatives ?? []) for (const w of group.words) alt.add(w);
  alt.delete(raw.translation);
  return {
    word: raw.word,
    translation: raw.translation,
    examples: (raw.examples ?? []).map((source) => ({ source, target: '' })),
    alternativeTranslations: [...alt].slice(0, 8),
    cefr: raw.cefr_level ?? undefined,
    pos: raw.alternatives?.[0]?.pos || undefined,
  };
}

export interface LookupArgs {
  word: string;
  source: string;
  target: string;
  context?: string;
  /** Page or episode the word was met on, for the vocabulary history. */
  url?: string;
  origin: 'cloud' | 'local';
}

/** A 4xx that is about the request itself: Google would refuse it too, so there is no fallback. */
function isRequestFault(err: unknown): boolean {
  const { status } = parseCloudError(err);
  return status !== null && status >= 400 && status < 500 && status !== 429 && status !== 401;
}

async function lookupLocal(args: LookupArgs): Promise<WordDetails> {
  const raw = await invoke<RawLocalTranslation>('podcast_translate_word', {
    word: args.word.trim().toLowerCase(),
    sourceLang: args.source,
    targetLang: args.target,
  });
  if (!raw?.translation) throw new Error('UPSTREAM_EXHAUSTED');
  return fromLocalTranslation(raw);
}

/**
 * One lookup. Signed in: translate-v2 (shared cache, curated word data, our own
 * IPA/CEFR/part of speech, and the server records the vocabulary history). If the
 * cloud cannot answer for a reason that is not the request's fault, the local
 * Google path answers instead - the reader is staring at a word.
 */
export async function lookupWord(args: LookupArgs): Promise<WordDetails> {
  const word = args.word.trim();
  if (!word) throw new Error('MISSING_WORD');
  if (args.origin === 'local') return lookupLocal({ ...args, word });

  const params = new URLSearchParams({ word, source: args.source, target: args.target });
  if (args.context) params.set('context', args.context.slice(0, 500));
  if (args.url) params.set('url', args.url.slice(0, 500));
  try {
    const details = await supabaseCall<WordDetails>('GET', `/translate-v2?${params.toString()}`);
    if (!details?.translation) throw new Error('UPSTREAM_EXHAUSTED');
    return { ...details, examples: details.examples ?? [] };
  } catch (err) {
    if (isRequestFault(err)) throw err;
    return lookupLocal({ ...args, word });
  }
}

/** Every successful lookup is written into the desk vocabulary history (phrases up to 80 characters). */
export async function logLookup(args: {
  word: string;
  source: string;
  details: WordDetails;
  context?: string;
}): Promise<void> {
  const word = args.word.trim();
  if (!word || word.length > 80) return;
  try {
    // Adds the word (or fills it in) and counts the lookup: the Vocabulary page's
    // "most clicked" and its recommendations read that count.
    await invoke('vocabulary_log_lookup', {
      word: word.toLowerCase(),
      language: args.source,
      translation: args.details.translation || null,
      pos: args.details.pos ?? null,
      cefrLevel: args.details.cefr ?? null,
      context: args.context ? args.context.slice(0, 500) : null,
    });
  } catch (err) {
    console.warn('[WordDialog] vocabulary history not written', err);
  }
}

// ── Dictionaries ──────────────────────────────────────────────────────────

interface FreeDictRaw {
  word: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: {
    partOfSpeech: string;
    definitions: {
      definition: string;
      example?: string;
      synonyms?: string[];
      antonyms?: string[];
    }[];
  }[];
  origin?: string;
}

/** dictionaryapi.dev, the free English dictionary a signed-out reader gets. */
async function freeDictDirect(word: string): Promise<DictionaryResponse> {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
  );
  if (!res.ok) return { found: false };
  const first = ((await res.json()) as FreeDictRaw[])[0];
  if (!first) return { found: false };
  const entry: DictionaryEntry = {
    word: first.word,
    phonetics: first.phonetics ?? [],
    origin: first.origin,
    meanings: (first.meanings ?? []).map((m) => ({
      partOfSpeech: m.partOfSpeech,
      definitions: m.definitions.map((d) => ({
        definition: d.definition,
        example: d.example,
        synonyms: d.synonyms ?? [],
        antonyms: d.antonyms ?? [],
      })),
    })),
  };
  return { found: true, entry };
}

/** 'dictionary' (Free Dictionary) or 'merriam-webster'. M-W needs the account: null signed out. */
export async function fetchDictionary(
  kind: 'freedict' | 'merriam-webster',
  word: string,
  signedIn: boolean,
): Promise<DictionaryResponse | null> {
  const clean = word.trim();
  if (!signedIn) return kind === 'freedict' ? freeDictDirect(clean) : null;
  try {
    return await supabaseCall<DictionaryResponse>(
      'GET',
      `/dictionary?action=${kind}&word=${encodeURIComponent(clean)}`,
    );
  } catch (err) {
    if (kind === 'freedict' && !isRequestFault(err)) return freeDictDirect(clean);
    throw err;
  }
}

/** A clicked word's verb paradigm and noun gender (public read, no meanings). */
export function fetchGrammar(word: string, lang: string): Promise<WordGrammarResponse> {
  return supabaseCall<WordGrammarResponse>(
    'GET',
    `/cheatsheet?action=word-grammar&lang=${lang}&word=${encodeURIComponent(word)}`,
  );
}

// ── AI ────────────────────────────────────────────────────────────────────

interface CloudAIResponse {
  found: boolean;
  data?: AIWordAnalysis;
  error?: string;
  code?: string;
}

export class AIError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export interface AnalyzeArgs {
  word: string;
  sentence: string;
  source: string;
  target: string;
  route: 'cloud' | 'local';
}

/** Pro: FlexiLingo's analysis (cached rows carry senses, collocations, word family). Otherwise the local model. */
export async function analyzeWord(args: AnalyzeArgs): Promise<AIWordAnalysis> {
  let data: AIWordAnalysis | undefined;
  try {
    if (args.route === 'cloud') {
      const res = await supabaseCall<CloudAIResponse>('POST', '/get-ai-translation', {
        word: args.word,
        sentence: args.sentence,
        targetLanguage: args.target,
        sourceLanguage: args.source,
      });
      if (!res.found || !res.data) throw new AIError(res.code ?? 'UNKNOWN_ERROR');
      data = res.data;
    } else {
      data = await invoke<AIWordAnalysis>('ai_word_analysis', {
        word: args.word,
        sentence: args.sentence,
        targetLanguage: args.target,
        sourceLanguage: args.source,
      });
    }
  } catch (err) {
    if (err instanceof AIError) throw err;
    throw new AIError(errorCodeOf(err));
  }
  if (!data?.contextualTranslation) throw new AIError('UNKNOWN_ERROR');
  return { ...data, word: data.word || args.word, examples: data.examples ?? [] };
}
