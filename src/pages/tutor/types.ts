export type AIProvider = 'ollama' | 'openai';
export type MessageRole = 'system' | 'user' | 'assistant';
export type ConversationStatus = 'active' | 'archived' | 'deleted';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
  grammarRule: string;
  severity: string;
}

export interface VocabSuggestion {
  word: string;
  translation: string;
  pos?: string;
  cefrLevel?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  language: string;
  cefrLevel: CEFRLevel;
  scenarioId?: string;
  provider: AIProvider;
  model: string;
  messageCount: number;
  correctionsCount: number;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  corrections: GrammarCorrection[];
  vocabSuggestions: VocabSuggestion[];
  tokenCount: number;
  createdAt: string;
}

// ── Raw types from Rust IPC (snake_case) ──────────────────

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
}

export interface RawGrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
  grammar_rule: string;
  severity: string;
}

export interface RawVocabSuggestion {
  word: string;
  translation: string;
  pos: string | null;
  cefr_level: string | null;
}

export interface RawMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  corrections: RawGrammarCorrection[];
  vocab_suggestions: RawVocabSuggestion[];
  token_count: number;
  created_at: string;
}

export interface RawSendMessageResult {
  user_message: RawMessage;
  assistant_message: RawMessage;
}

// ── Mappers ───────────────────────────────────────────────

function mapCorrection(raw: RawGrammarCorrection): GrammarCorrection {
  return {
    original: raw.original,
    corrected: raw.corrected,
    explanation: raw.explanation,
    grammarRule: raw.grammar_rule,
    severity: raw.severity,
  };
}

function mapVocab(raw: RawVocabSuggestion): VocabSuggestion {
  return {
    word: raw.word,
    translation: raw.translation,
    pos: raw.pos ?? undefined,
    cefrLevel: raw.cefr_level ?? undefined,
  };
}

export function mapConversation(raw: RawConversationSummary): ConversationSummary {
  return {
    id: raw.id,
    title: raw.title,
    language: raw.language,
    cefrLevel: raw.cefr_level as CEFRLevel,
    scenarioId: raw.scenario_id ?? undefined,
    provider: raw.provider as AIProvider,
    model: raw.model,
    messageCount: raw.message_count,
    correctionsCount: raw.corrections_count,
    status: raw.status as ConversationStatus,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function mapMessage(raw: RawMessage): Message {
  return {
    id: raw.id,
    conversationId: raw.conversation_id,
    role: raw.role as MessageRole,
    content: raw.content,
    corrections: (raw.corrections ?? []).map(mapCorrection),
    vocabSuggestions: (raw.vocab_suggestions ?? []).map(mapVocab),
    tokenCount: raw.token_count,
    createdAt: raw.created_at,
  };
}
