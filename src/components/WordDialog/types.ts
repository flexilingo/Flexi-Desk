/** Shapes shared by the word dialog's tabs (mirrors the website's word-dialog and dictionary types). */

export interface WordExample {
  source: string;
  target?: string;
}

export interface WordDetails {
  word: string;
  translation: string;
  examples: WordExample[];
  alternativeTranslations?: string[];
  /** IPA of the source word. */
  phonetic?: string;
  /** CEFR level of the word in ITS OWN language. */
  cefr?: string;
  /** Part of speech, e.g. 'noun'. */
  pos?: string;
}

export type WordDialogTab = 'google' | 'ai' | 'dictionary' | 'merriam-webster';

export interface DeckCardData {
  word: string;
  back: string;
  notes: string;
  examples: WordExample[];
  source: WordDialogTab;
}

export interface DictionaryPhonetic {
  text?: string | null;
  audio?: string | null;
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
  word: string;
  phonetics: DictionaryPhonetic[];
  meanings: DictionaryMeaning[];
  origin?: string;
}

export interface DictionaryResponse {
  found: boolean;
  entry?: DictionaryEntry;
  error?: string;
}

export interface AIWordSense {
  label: string;
  translation: string;
  definition?: string;
  definitionEn?: string;
  example?: { source: string; target: string };
}

export interface AIWordFamilyEntry {
  form: string;
  pos: string;
  gloss: string;
}

/** FlexiLingo's cloud analysis, or the on-device model's smaller subset of it. */
export interface AIWordAnalysis {
  word: string;
  ipa?: string;
  contextualTranslation: string;
  definition?: string;
  partOfSpeech?: string;
  difficulty?: string;
  examples?: { source: string; target: string; en?: string; tr?: string }[];
  synonyms?: string[];
  tip?: string;
  lemma?: string | null;
  collocations?: string[];
  antonyms?: string[];
  otherMeanings?: AIWordSense[];
  wordFamily?: AIWordFamilyEntry[];
  register?: string | null;
}

export interface WordGrammarForm {
  pr: string;
  form: string;
  ipa: string;
}

export interface WordGrammarTense {
  mood: string;
  tense: string;
  forms: WordGrammarForm[];
}

export interface WordGrammarResponse {
  lang: string;
  word: string;
  noun: { lemma: string; gender: 'm' | 'f' | 'mf'; pluralOnly: boolean } | null;
  verb: { lemma: string; forms: WordGrammarTense[] } | null;
}

/** One level of the word trail: the host's word first, then every word looked up from inside. */
export interface TrailLevel {
  word: string;
  /** The sentence the word was clicked in; the AI tab reads the word in it. */
  context?: string;
  /** Set only when this level is read in another pair than the dialog's own. */
  source?: string;
  target?: string;
  /** Where the reader was when they went one level deeper. */
  tab?: WordDialogTab;
  scrollTop?: number;
}

export interface WordDialogProps {
  word: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The language the TEXT is written in (document / episode / deck). Wins over every setting. */
  sourceLang?: string;
  /** Pins the translation language. Without it the reader's own setting is used and can be changed here. */
  targetLang?: string;
  /** Lets a pinned `targetLang` be changed by the reader; a pick is reported here. */
  onTargetLanguageChange?: (code: string) => void;
  /** The sentence the word was met in. */
  sentenceContext?: string;
  /** A caller that names a tab gets it; otherwise the reader's own last choice. */
  initialTab?: WordDialogTab;
  /** Podcast host: enables the bookmark button and the player's word statistics. */
  episodeId?: string;
  positionMs?: number;
}
