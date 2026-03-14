export type SourceType = 'paste' | 'url' | 'file' | 'pdf' | 'epub';

export interface ReadingDocument {
  id: string;
  title: string;
  content: string;
  language: string;
  sourceType: SourceType;
  sourceUrl?: string;
  wordCount: number;
  progress: number;
  lastPosition: number;
  tokens: Token[];
  createdAt: string;
  updatedAt: string;
}

export interface ReadingDocumentSummary {
  id: string;
  title: string;
  language: string;
  sourceType: SourceType;
  wordCount: number;
  progress: number;
  highlightCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Token {
  text: string;
  lower: string;
  is_word: boolean;
  index: number;
  sentence_index: number;
}

export interface ReadingHighlight {
  id: string;
  documentId: string;
  word: string;
  sentence?: string;
  wordIndex?: number;
  vocabularyId?: number;
  createdAt: string;
}

// ── Raw types (snake_case from Rust IPC) ──────────────────

export interface RawReadingDocument {
  id: string;
  title: string;
  content: string;
  language: string;
  source_type: string;
  source_url: string | null;
  word_count: number;
  progress: number;
  last_position: number;
  tokens_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawReadingDocumentSummary {
  id: string;
  title: string;
  language: string;
  source_type: string;
  word_count: number;
  progress: number;
  highlight_count: number;
  created_at: string;
  updated_at: string;
}

export interface RawReadingHighlight {
  id: string;
  document_id: string;
  word: string;
  sentence: string | null;
  word_index: number | null;
  vocabulary_id: number | null;
  created_at: string;
}

// ── Mappers ───────────────────────────────────────────────

export function mapDocument(raw: RawReadingDocument): ReadingDocument {
  let tokens: Token[] = [];
  if (raw.tokens_json) {
    try {
      tokens = JSON.parse(raw.tokens_json);
    } catch {
      tokens = [];
    }
  }

  return {
    id: raw.id,
    title: raw.title,
    content: raw.content,
    language: raw.language,
    sourceType: raw.source_type as SourceType,
    sourceUrl: raw.source_url ?? undefined,
    wordCount: raw.word_count,
    progress: raw.progress,
    lastPosition: raw.last_position,
    tokens,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function mapDocumentSummary(raw: RawReadingDocumentSummary): ReadingDocumentSummary {
  return {
    id: raw.id,
    title: raw.title,
    language: raw.language,
    sourceType: raw.source_type as SourceType,
    wordCount: raw.word_count,
    progress: raw.progress,
    highlightCount: raw.highlight_count,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function mapHighlight(raw: RawReadingHighlight): ReadingHighlight {
  return {
    id: raw.id,
    documentId: raw.document_id,
    word: raw.word,
    sentence: raw.sentence ?? undefined,
    wordIndex: raw.word_index ?? undefined,
    vocabularyId: raw.vocabulary_id ?? undefined,
    createdAt: raw.created_at,
  };
}
