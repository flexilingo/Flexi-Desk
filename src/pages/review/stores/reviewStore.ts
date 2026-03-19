import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type {
  Algorithm,
  CardFull,
  DeckWithStats,
  Rating,
  ReviewMode,
  ReviewSession,
  SessionSummary,
  RawDeckWithStats,
  RawCardFull,
  RawReviewSession,
  RawSessionSummary,
} from '../types';
import { mapCard, mapDeck, mapSession, mapSummary } from '../types';

interface ReviewState {
  // Deck browsing
  decks: DeckWithStats[];
  isLoadingDecks: boolean;
  selectedDeckId: string | null;
  deckCards: CardFull[];
  isLoadingCards: boolean;

  // Current session
  session: ReviewSession | null;
  currentCard: CardFull | null;
  isFlipped: boolean;
  mode: ReviewMode;
  cardsRemaining: number;
  isLoadingCard: boolean;
  isRating: boolean;
  cardStartTime: number | null;

  // Summary
  sessionComplete: boolean;
  summary: SessionSummary | null;

  // Error
  error: string | null;

  // Actions
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
  startSession: (deckId: string, limit?: number) => Promise<void>;
  flipCard: () => void;
  rateCard: (rating: Rating) => Promise<void>;
  completeSession: () => Promise<void>;
  resetSession: () => void;
  clearError: () => void;
  mergeDecks: (sourceDeckId: string, targetDeckId: string, deleteSource: boolean) => Promise<void>;
}

export const useReviewStore = create<ReviewState>()(
  immer((set, get) => ({
    decks: [],
    isLoadingDecks: false,
    selectedDeckId: null,
    deckCards: [],
    isLoadingCards: false,
    session: null,
    currentCard: null,
    isFlipped: false,
    mode: 'flip' as ReviewMode,
    cardsRemaining: 0,
    isLoadingCard: false,
    isRating: false,
    cardStartTime: null,
    sessionComplete: false,
    summary: null,
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

    startSession: async (deckId, limit) => {
      set((s) => {
        s.isLoadingCard = true;
        s.error = null;
      });
      try {
        const rawSession = await invoke<RawReviewSession>('srs_start_session', {
          deckId,
          limit,
        });
        const session = mapSession(rawSession);

        if (session.totalCards === 0) {
          set((s) => {
            s.error = 'No cards due for review';
            s.isLoadingCard = false;
          });
          return;
        }

        const rawCard = await invoke<RawCardFull>('srs_get_session_card', {
          sessionId: session.id,
          index: 0,
        });

        set((s) => {
          s.session = session;
          s.currentCard = mapCard(rawCard);
          s.isFlipped = false;
          s.cardsRemaining = session.totalCards;
          s.sessionComplete = false;
          s.summary = null;
          s.isLoadingCard = false;
          s.cardStartTime = Date.now();
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
          s.isLoadingCard = false;
        });
      }
    },

    flipCard: () => {
      set((s) => {
        s.isFlipped = true;
      });
    },

    rateCard: async (rating) => {
      const { session, currentCard, cardStartTime } = get();
      if (!session || !currentCard) return;

      const timeSpentMs = cardStartTime ? Date.now() - cardStartTime : 0;

      set((s) => {
        s.isRating = true;
      });
      try {
        await invoke('srs_rate_card', {
          sessionId: session.id,
          cardId: currentCard.id,
          rating,
          timeSpentMs,
        });

        const nextIndex = session.currentIndex + 1;
        if (nextIndex >= session.totalCards) {
          // Session done
          const rawSummary = await invoke<RawSessionSummary>('srs_complete_session', {
            sessionId: session.id,
          });
          set((s) => {
            s.sessionComplete = true;
            s.summary = mapSummary(rawSummary);
            s.currentCard = null;
            s.isRating = false;
          });
        } else {
          const rawCard = await invoke<RawCardFull>('srs_get_session_card', {
            sessionId: session.id,
            index: nextIndex,
          });
          set((s) => {
            s.currentCard = mapCard(rawCard);
            s.isFlipped = false;
            s.session!.currentIndex = nextIndex;
            s.session!.reviewedCards += 1;
            s.cardsRemaining -= 1;
            if (rating === 'good' || rating === 'easy') {
              s.session!.correctCount += 1;
            }
            s.isRating = false;
            s.cardStartTime = Date.now();
          });
        }
      } catch (e) {
        set((s) => {
          s.error = String(e);
          s.isRating = false;
        });
      }
    },

    completeSession: async () => {
      const { session } = get();
      if (!session) return;
      try {
        const rawSummary = await invoke<RawSessionSummary>('srs_complete_session', {
          sessionId: session.id,
        });
        set((s) => {
          s.sessionComplete = true;
          s.summary = mapSummary(rawSummary);
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    resetSession: () => {
      set((s) => {
        s.session = null;
        s.currentCard = null;
        s.isFlipped = false;
        s.cardsRemaining = 0;
        s.sessionComplete = false;
        s.summary = null;
        s.error = null;
        s.cardStartTime = null;
      });
    },

    clearError: () => {
      set((s) => {
        s.error = null;
      });
    },

    mergeDecks: async (sourceDeckId, targetDeckId, deleteSource) => {
      try {
        await invoke('srs_merge_decks', {
          sourceDeckId,
          targetDeckId,
          deleteSource,
        });
        await get().fetchDecks();
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },
  })),
);
