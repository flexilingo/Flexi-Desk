import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type { Algorithm, CardFull, DeckWithStats, RawDeckWithStats, RawCardFull } from '../types';
import { mapCard, mapDeck } from '../types';

// Deck-management store for the "Decks" surface. The SRS review-session state
// (queue, ratings, summary, review settings) moved to the Study module, which
// runs its own engine over the same decks — see pages/study/stores/studyStore.ts.
interface ReviewState {
  // ── Deck browsing ──
  decks: DeckWithStats[];
  isLoadingDecks: boolean;
  selectedDeckId: string | null;
  deckCards: CardFull[];
  isLoadingCards: boolean;
  error: string | null;

  // ── Deck actions ──
  fetchDecks: () => Promise<void>;
  createDeck: (
    name: string,
    language: string,
    algorithm: Algorithm,
    description?: string,
  ) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
  selectDeck: (id: string | null) => void;
  fetchDeckCards: (deckId: string) => Promise<void>;
  addCard: (input: {
    deckId: string;
    word: string;
    language: string;
    translation?: string;
    definition?: string;
    pos?: string;
    cefrLevel?: string;
    exampleSentence?: string;
    notes?: string;
  }) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  mergeDecks: (sourceDeckId: string, targetDeckId: string, deleteSource: boolean) => Promise<void>;

  clearError: () => void;
}

export const useReviewStore = create<ReviewState>()(
  immer((set, get) => ({
    decks: [],
    isLoadingDecks: false,
    selectedDeckId: null,
    deckCards: [],
    isLoadingCards: false,
    error: null,

    fetchDecks: async () => {
      set((s) => {
        s.isLoadingDecks = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawDeckWithStats[]>('srs_list_decks');
        set((s) => {
          s.decks = raw.map(mapDeck);
          s.isLoadingDecks = false;
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
          s.isLoadingDecks = false;
        });
      }
    },

    createDeck: async (name, language, algorithm, description) => {
      try {
        await invoke<RawDeckWithStats>('srs_create_deck', {
          name,
          language,
          algorithm,
          description,
        });
        await get().fetchDecks();
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    deleteDeck: async (id) => {
      try {
        await invoke('srs_delete_deck', { id });
        await get().fetchDecks();
        set((s) => {
          if (s.selectedDeckId === id) s.selectedDeckId = null;
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    selectDeck: (id) => {
      set((s) => {
        s.selectedDeckId = id;
      });
    },

    fetchDeckCards: async (deckId) => {
      set((s) => {
        s.isLoadingCards = true;
      });
      try {
        const raw = await invoke<RawCardFull[]>('srs_get_deck_cards', {
          deckId,
          page: 1,
          pageSize: 200,
        });
        set((s) => {
          s.deckCards = raw.map(mapCard);
          s.isLoadingCards = false;
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
          s.isLoadingCards = false;
        });
      }
    },

    addCard: async (input) => {
      try {
        await invoke('srs_add_card', {
          deckId: input.deckId,
          word: input.word,
          language: input.language,
          translation: input.translation,
          definition: input.definition,
          pos: input.pos,
          cefrLevel: input.cefrLevel,
          exampleSentence: input.exampleSentence,
          notes: input.notes,
        });
        await get().fetchDeckCards(input.deckId);
        await get().fetchDecks();
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    deleteCard: async (cardId) => {
      const deckId = get().selectedDeckId;
      try {
        await invoke('srs_delete_card', { cardId });
        if (deckId) await get().fetchDeckCards(deckId);
        await get().fetchDecks();
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    mergeDecks: async (sourceDeckId, targetDeckId, deleteSource) => {
      try {
        await invoke('srs_merge_decks', { sourceDeckId, targetDeckId, deleteSource });
        await get().fetchDecks();
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),
  })),
);
