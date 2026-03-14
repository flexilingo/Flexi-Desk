export type Algorithm = 'leitner' | 'sm2' | 'fsrs';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';
export type ReviewMode = 'flip' | 'typing' | 'audio';

export interface Deck {
  id: string;
  name: string;
  description?: string;
  language: string;
  algorithm: Algorithm;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeckWithStats extends Deck {
  dueToday: number;
  newCards: number;
}

export interface CardFull {
  id: string;
  deckId: string;
  vocabularyId: number;
  front: string;
  back: string;
  notes?: string;
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

export interface ScheduleResult {
  intervalDays: number;
  dueDate: string;
  state: CardState;
  algorithmState: Record<string, unknown>;
}

export interface ReviewSession {
  id: string;
  deckId?: string;
  algorithm: Algorithm;
  status: SessionStatus;
  totalCards: number;
  reviewedCards: number;
  correctCount: number;
  cardIds: string[];
  currentIndex: number;
  startedAt: string;
  completedAt?: string;
  durationSeconds: number;
}

export interface SessionSummary {
  totalCards: number;
  reviewedCards: number;
  correctCount: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  accuracy: number;
  durationSeconds: number;
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
  algorithm: string;
  card_count: number;
  due_today: number;
  new_cards: number;
  created_at: string;
  updated_at: string;
}

export interface RawCardFull {
  id: string;
  deck_id: string;
  vocabulary_id: number;
  front: string;
  back: string;
  notes: string | null;
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

export interface RawReviewSession {
  id: string;
  deck_id: string | null;
  algorithm: string;
  status: string;
  total_cards: number;
  reviewed_cards: number;
  correct_count: number;
  card_ids: string[];
  current_index: number;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number;
}

export interface RawSessionSummary {
  total_cards: number;
  reviewed_cards: number;
  correct_count: number;
  again_count: number;
  hard_count: number;
  good_count: number;
  easy_count: number;
  accuracy: number;
  duration_seconds: number;
}

// ── Mappers ────────────────────────────────────────────────

export function mapDeck(raw: RawDeckWithStats): DeckWithStats {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    language: raw.language,
    algorithm: raw.algorithm as Algorithm,
    cardCount: raw.card_count,
    dueToday: raw.due_today,
    newCards: raw.new_cards,
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

export function mapSession(raw: RawReviewSession): ReviewSession {
  return {
    id: raw.id,
    deckId: raw.deck_id ?? undefined,
    algorithm: raw.algorithm as Algorithm,
    status: raw.status as SessionStatus,
    totalCards: raw.total_cards,
    reviewedCards: raw.reviewed_cards,
    correctCount: raw.correct_count,
    cardIds: raw.card_ids,
    currentIndex: raw.current_index,
    startedAt: raw.started_at,
    completedAt: raw.completed_at ?? undefined,
    durationSeconds: raw.duration_seconds,
  };
}

export function mapSummary(raw: RawSessionSummary): SessionSummary {
  return {
    totalCards: raw.total_cards,
    reviewedCards: raw.reviewed_cards,
    correctCount: raw.correct_count,
    againCount: raw.again_count,
    hardCount: raw.hard_count,
    goodCount: raw.good_count,
    easyCount: raw.easy_count,
    accuracy: raw.accuracy,
    durationSeconds: raw.duration_seconds,
  };
}
