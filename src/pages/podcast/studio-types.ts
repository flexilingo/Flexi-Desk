export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'phrase' | 'unknown';
export type WordStatus = 'new' | 'seen' | 'learning' | 'mastered';

export interface EnhancedWord {
  text: string;
  cleanText: string;
  index: number;
  cefr: CefrLevel;
  status: WordStatus;
  isClickable: boolean;
  isHidden?: boolean;
  translation?: string;
  phraseId?: string;
  isPartOfPhrase?: boolean;
  phraseText?: string;
  phraseType?: string;
  phraseDefinition?: string;
  nlpSource?: 'oxford' | 'nlp' | 'estimated';
  confidence?: number;
  isEstimated?: boolean;
  collocationId?: string;
  collocationText?: string;
  collocationScore?: number;
}

export interface EnhancedSubtitle {
  id: string;
  text: string;
  translation?: string;
  startTime: number;
  endTime: number;
  words: EnhancedWord[];
  difficulty: number;
  isProcessed: boolean;
  activeWordIndex?: number;
  isKaraokeUpdate?: boolean;
}
