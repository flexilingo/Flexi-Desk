import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface VocabularyWord {
  id?: number;
  word: string;
  language: string;
  pos?: string;
  cefrLevel?: string;
  translation?: string;
  definition?: string;
  phonetic?: string;
  examples?: string[];
  sourceModule: string;
  contextSentence?: string;
  audioPath?: string;
  createdAt?: string;
}

interface VocabularyState {
  words: VocabularyWord[];
  addWord: (word: VocabularyWord) => void;
  removeWord: (id: number) => void;
  getWordsByLanguage: (language: string) => VocabularyWord[];
}

export const useVocabularyStore = create<VocabularyState>()(
  immer((set, get) => ({
    words: [],

    addWord: (word) =>
      set((state) => {
        state.words.push(word);
      }),

    removeWord: (id) =>
      set((state) => {
        state.words = state.words.filter((w) => w.id !== id);
      }),

    getWordsByLanguage: (language) => {
      return get().words.filter((w) => w.language === language);
    },
  })),
);
