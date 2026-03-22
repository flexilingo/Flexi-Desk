// ── Mode & Status enums ─────────────────────────────────

export type ConversationMode =
  | 'free'
  | 'role_play'
  | 'deck_practice'
  | 'vocab_challenge'
  | 'escape_room';

export type ConversationStatus = 'active' | 'archived' | 'deleted';
export type CorrectionType = 'grammar' | 'spelling' | 'word_choice' | 'word_order';

// ── ModeInfo ────────────────────────────────────────────

export interface ModeInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface RawModeInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export function mapModeInfo(raw: RawModeInfo): ModeInfo {
  return raw;
}

// ── GrammarCorrection ───────────────────────────────────

export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
  type: CorrectionType;
}

// ── VocabSuggestion ─────────────────────────────────────

export interface VocabSuggestion {
  word: string;
  translation: string;
  example: string;
  cefr: string;
}

// ── ConversationSummary ─────────────────────────────────

export interface ConversationSummary {
  id: string;
  title: string;
  language: string;
  cefrLevel: string;
  scenarioId?: string;
  provider: string;
  model: string;
  messageCount: number;
  correctionsCount: number;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  mode: ConversationMode;
  topic?: string;
  deckId?: string;
}

export interface RawConversationSummary {
  id: string;
  title: string;
  language: string;
  cefr_level: string;
  scenario_id: string | null;
  provider: string;
  model: string;
  message_count: number;
  corrections_count: number;
  status: string;
  created_at: string;
  updated_at: string;
  mode: string;
  topic: string | null;
  deck_id: string | null;
}

export function mapConversation(raw: RawConversationSummary): ConversationSummary {
  return {
    id: raw.id,
    title: raw.title,
    language: raw.language,
    cefrLevel: raw.cefr_level,
    scenarioId: raw.scenario_id ?? undefined,
    provider: raw.provider,
    model: raw.model,
    messageCount: raw.message_count,
    correctionsCount: raw.corrections_count,
    status: raw.status as ConversationStatus,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    mode: raw.mode as ConversationMode,
    topic: raw.topic ?? undefined,
    deckId: raw.deck_id ?? undefined,
  };
}

// ── MessageData ─────────────────────────────────────────

export interface MessageData {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  corrections: GrammarCorrection[];
  vocabSuggestions: VocabSuggestion[];
  tokenCount: number;
  createdAt: string;
}

export interface RawMessageData {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  corrections: GrammarCorrection[];
  vocab_suggestions: VocabSuggestion[];
  token_count: number;
  created_at: string;
}

export function mapMessage(raw: RawMessageData): MessageData {
  return {
    id: raw.id,
    conversationId: raw.conversation_id,
    role: raw.role as 'system' | 'user' | 'assistant',
    content: raw.content,
    corrections: raw.corrections ?? [],
    vocabSuggestions: raw.vocab_suggestions ?? [],
    tokenCount: raw.token_count,
    createdAt: raw.created_at,
  };
}

// ── SendMessageResult ───────────────────────────────────

export interface SendMessageResult {
  userMessage: MessageData;
  assistantMessage: MessageData;
}

export interface RawSendMessageResult {
  user_message: RawMessageData;
  assistant_message: RawMessageData;
}

export function mapSendMessageResult(raw: RawSendMessageResult): SendMessageResult {
  return {
    userMessage: mapMessage(raw.user_message),
    assistantMessage: mapMessage(raw.assistant_message),
  };
}

// ── Scenario ────────────────────────────────────────────

export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: string;
  cefrMin: string;
  openingPrompt: string;
}

export interface RawScenario {
  id: string;
  title: string;
  description: string;
  category: string;
  cefr_min: string;
  opening_prompt: string;
}

export function mapScenario(raw: RawScenario): Scenario {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    category: raw.category,
    cefrMin: raw.cefr_min,
    openingPrompt: raw.opening_prompt,
  };
}

// ── DeckCard ────────────────────────────────────────────

export interface DeckCard {
  id: string;
  front: string;
  back: string;
}

// ── SessionSummary (for future use) ─────────────────────

export interface SessionSummary {
  grammarScore: number;
  vocabScore: number;
  fluencyScore: number;
  overallScore: number;
  corrections: GrammarCorrection[];
  newWords: VocabSuggestion[];
  durationMinutes: number;
  messageCount: number;
}
