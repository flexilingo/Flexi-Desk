export type Algorithm = 'leitner' | 'sm2' | 'fsrs';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface CardNotes {
  generated_by?: string;
  mode?: string;
  /** Language the front text is written in; set by the content generator. */
  learning_lang?: string;
  ipa?: string;
  examples?: { source?: string; target?: string; en?: string; tr?: string }[];
  synonyms?: string[];
  antonyms?: string[];
  tip?: string;
  definition?: string;
  register?: 'formal' | 'informal' | 'slang' | 'neutral';
  source_context?: string;
  memory_hook?: string;
  common_mistakes?: { wrong: string; correct: string }[];
  collocations?: string[];
  pronunciation_tips?: string;
  cultural_note?: string;
  etymology?: string;
  part_of_speech?: string;
  difficulty?: string;
  cefr_level?: string;
  personal_note?: string;
  translation?: string;
  conjugations?: unknown;
}

export interface Deck {
  id: string;
  name: string;
  description?: string;
  /** Language the cards are written in. */
  language: string;
  /** Language the meanings are in; unknown for decks made before the pair existed. */
  nativeLanguage?: string;
  algorithm: Algorithm;
  cardCount: number;
  tags: string[];
  isPublic: boolean;
  /** The public deck this one was saved from. */
  originalDeckId?: string;
  /** The website deck this one was pushed to. */
  cloudDeckId?: string;
  sourceUrl?: string;
  sourceType?: string;
  sourcePublic: boolean;
  coverUrl?: string;
  totalClones: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeckWithStats extends Deck {
  dueToday: number;
  newCards: number;
  mastered: number;
}

export interface CardFull {
  id: string;
  deckId: string;
  /** Null for a card that is not a dictionary word (a saved public deck, a sentence). */
  vocabularyId: number | null;
  front: string;
  back: string;
  notes?: string;
  tags: string[];
  orderIndex: number;
  word: string;
  language: string;
  translation?: string;
  definition?: string;
  pos?: string;
  cefrLevel?: CEFRLevel;
  exampleSentence?: string;
  state: CardState;
  intervalDays: number;
  dueDate: string;
  reviewCount: number;
  boxNumber?: number;
  easinessFactor?: number;
  stability?: number;
  difficulty?: number;
}

export interface CardCreateInput {
  deckId: string;
  word: string;
  language: string;
  translation?: string;
  definition?: string;
  pos?: string;
  cefrLevel?: CEFRLevel;
  exampleSentence?: string;
  notes?: string;
}

// Rust sends snake_case, we map to camelCase via these raw types
export interface RawDeckWithStats {
  id: string;
  name: string;
  description: string | null;
  language: string;
  native_language: string | null;
  algorithm: string;
  card_count: number;
  due_today: number;
  new_cards: number;
  mastered: number;
  tags: string[];
  is_public: boolean;
  original_deck_id: string | null;
  cloud_deck_id: string | null;
  source_url: string | null;
  source_type: string | null;
  source_public: boolean;
  cover_url: string | null;
  total_clones: number;
  created_at: string;
  updated_at: string;
}

export interface RawCardFull {
  id: string;
  deck_id: string;
  vocabulary_id: number | null;
  front: string;
  back: string;
  notes: string | null;
  tags: string[];
  order_index: number;
  word: string;
  language: string;
  translation: string | null;
  definition: string | null;
  pos: string | null;
  cefr_level: string | null;
  example_sentence: string | null;
  state: string;
  interval_days: number;
  due_date: string;
  review_count: number;
  box_number: number | null;
  easiness_factor: number | null;
  stability: number | null;
  difficulty: number | null;
}

// ── Mappers ────────────────────────────────────────────────

export function mapDeck(raw: RawDeckWithStats): DeckWithStats {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    language: raw.language,
    nativeLanguage: raw.native_language ?? undefined,
    algorithm: raw.algorithm as Algorithm,
    cardCount: raw.card_count,
    dueToday: raw.due_today,
    newCards: raw.new_cards,
    mastered: raw.mastered ?? 0,
    tags: raw.tags ?? [],
    isPublic: !!raw.is_public,
    originalDeckId: raw.original_deck_id ?? undefined,
    cloudDeckId: raw.cloud_deck_id ?? undefined,
    sourceUrl: raw.source_url ?? undefined,
    sourceType: raw.source_type ?? undefined,
    sourcePublic: !!raw.source_public,
    coverUrl: raw.cover_url ?? undefined,
    totalClones: raw.total_clones ?? 0,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function mapCard(raw: RawCardFull): CardFull {
  return {
    id: raw.id,
    deckId: raw.deck_id,
    vocabularyId: raw.vocabulary_id,
    front: raw.front,
    back: raw.back,
    notes: raw.notes ?? undefined,
    tags: raw.tags ?? [],
    orderIndex: raw.order_index ?? 0,
    word: raw.word,
    language: raw.language,
    translation: raw.translation ?? undefined,
    definition: raw.definition ?? undefined,
    pos: raw.pos ?? undefined,
    cefrLevel: (raw.cefr_level as CEFRLevel) ?? undefined,
    exampleSentence: raw.example_sentence ?? undefined,
    state: raw.state as CardState,
    intervalDays: raw.interval_days,
    dueDate: raw.due_date,
    reviewCount: raw.review_count,
    boxNumber: raw.box_number ?? undefined,
    easinessFactor: raw.easiness_factor ?? undefined,
    stability: raw.stability ?? undefined,
    difficulty: raw.difficulty ?? undefined,
  };
}

// ── Deck Hub Types ─────────────────────────────────────────

export interface ExamplePair {
  source: string;
  target: string;
}

export interface AnalyzedItem {
  word: string;
  translation: string;
  definition: string;
  pos: string;
  cefrLevel: string;
  ipa: string;
  examples: ExamplePair[];
  memoryHook: string | null;
  collocations: string[];
  cardType: string;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface DeckHubCardInput {
  word: string;
  translation?: string;
  definition?: string;
  pos?: string;
  cefrLevel?: string;
  ipa?: string;
  exampleSentence?: string;
  memoryHook?: string;
  collocations?: string[];
  cardType?: string;
}

// Raw snake_case from Rust
export interface RawAnalyzedItem {
  word: string;
  translation: string;
  definition: string;
  pos: string;
  cefr_level: string;
  ipa: string;
  examples: { source: string; target: string }[];
  memory_hook: string | null;
  collocations: string[];
  card_type: string;
}

export interface RawOcrResult {
  text: string;
  confidence: number;
}

export function mapAnalyzedItem(raw: RawAnalyzedItem): AnalyzedItem {
  return {
    word: raw.word,
    translation: raw.translation,
    definition: raw.definition,
    pos: raw.pos,
    cefrLevel: raw.cefr_level,
    ipa: raw.ipa,
    examples: raw.examples,
    memoryHook: raw.memory_hook,
    collocations: raw.collocations,
    cardType: raw.card_type,
  };
}

export function toDeckHubCardInput(item: AnalyzedItem): DeckHubCardInput {
  return {
    word: item.word,
    translation: item.translation || undefined,
    definition: item.definition || undefined,
    pos: item.pos || undefined,
    cefrLevel: item.cefrLevel || undefined,
    ipa: item.ipa || undefined,
    exampleSentence: item.examples[0]?.source || undefined,
    memoryHook: item.memoryHook || undefined,
    collocations: item.collocations.length > 0 ? item.collocations : undefined,
    cardType: item.cardType || undefined,
  };
}
