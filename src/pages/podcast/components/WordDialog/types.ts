// ── Shared types for WordDialog tabs ────────────────────

export type WordDialogTab = 'google' | 'ai' | 'dictionary' | 'merriam-webster';

// ── Dictionary response (Free Dictionary & M-W) ────────

export interface DictionaryPhonetic {
  text: string | null;
  audio: string | null;
  accent?: 'us' | 'uk' | 'general';
}

export interface DictionaryDefinition {
  definition: string;
  example?: string;
  synonyms: string[];
  antonyms: string[];
}

export interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: DictionaryDefinition[];
}

export interface DictionaryEntry {
  source: string;
  word: string;
  phonetics: DictionaryPhonetic[];
  meanings: DictionaryMeaning[];
  origin?: string;
}

export interface DictionaryResponse {
  found: boolean;
  entry?: DictionaryEntry;
  error?: string;
  suggestions?: string[];
  cached?: boolean;
}

// ── AI Translation response ─────────────────────────────

export interface AIWordAnalysis {
  word: string;
  ipa?: string;
  contextualTranslation: string;
  definition?: string;
  partOfSpeech: string;
  difficulty?: string;
  examples?: { source: string; target: string }[];
  synonyms?: string[];
  tip?: string;
}

