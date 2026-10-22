import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type { Algorithm, DeckWithStats, RawDeckWithStats } from '../types';
import { mapDeck } from '../types';

/** The numbers above the decks list (`srs_decks_overview`). */
export interface DecksOverview {
  totalReviewed: number;
  totalMastered: number;
  rollingAccuracy: number;
  currentStreak: number;
  longestStreak: number;
}

interface RawOverview {
  total_reviewed: number;
  total_mastered: number;
  rolling_accuracy: number;
  current_streak: number;
  longest_streak: number;
}

export interface DeckInput {
  name: string;
  language: string;
  nativeLanguage: string;
  algorithm: Algorithm;
  description?: string;
  tags: string[];
  isPublic: boolean;
}

export interface DeckPatch {
  name?: string;
  description?: string;
  language?: string;
  nativeLanguage?: string;
  algorithm?: Algorithm;
  tags?: string[];
  isPublic?: boolean;
  sourcePublic?: boolean;
}

// Deck-management store for the "Decks" surface. The SRS session state lives in the Study
// module (pages/study/stores/studyStore.ts), which runs over the same decks.
//
// Mutations throw: the page or dialog that asked shows the failure inline and stays open,
// instead of the store swallowing it into a shared `error` nobody is looking at.
interface ReviewState {
  decks: DeckWithStats[];
  isLoadingDecks: boolean;
  overview: DecksOverview | null;
  error: string | null;

  fetchDecks: () => Promise<void>;
  fetchOverview: () => Promise<void>;
  createDeck: (input: DeckInput) => Promise<DeckWithStats>;
  updateDeck: (id: string, patch: DeckPatch) => Promise<DeckWithStats>;
  deleteDeck: (id: string) => Promise<void>;
  mergeDecks: (sourceDeckId: string, targetDeckId: string, deleteSource: boolean) => Promise<void>;
  /** Put one deck, as returned by a command, into the list. */
  applyDeck: (deck: DeckWithStats) => void;
  clearError: () => void;
}

export const useReviewStore = create<ReviewState>()(
  immer((set, get) => ({
    decks: [],
    isLoadingDecks: false,
    overview: null,
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

    fetchOverview: async () => {
      try {
        const o = await invoke<RawOverview>('srs_decks_overview');
        set((s) => {
          s.overview = {
            totalReviewed: o.total_reviewed,
            totalMastered: o.total_mastered,
            rollingAccuracy: o.rolling_accuracy,
            currentStreak: o.current_streak,
            longestStreak: o.longest_streak,
          };
        });
      } catch {
        // The numbers are a courtesy; the list works without them.
      }
    },

    createDeck: async (input) => {
      const raw = await invoke<RawDeckWithStats>('srs_create_deck', {
        name: input.name,
        language: input.language,
        nativeLanguage: input.nativeLanguage,
        algorithm: input.algorithm,
        description: input.description,
        tags: input.tags,
        isPublic: input.isPublic,
      });
      const deck = mapDeck(raw);
      get().applyDeck(deck);
      return deck;
    },

    updateDeck: async (id, patch) => {
      const raw = await invoke<RawDeckWithStats>('srs_update_deck', { id, ...patch });
      const deck = mapDeck(raw);
      get().applyDeck(deck);
      return deck;
    },

    deleteDeck: async (id) => {
      await invoke('srs_delete_deck', { id });
      set((s) => {
        s.decks = s.decks.filter((d) => d.id !== id);
      });
    },

    mergeDecks: async (sourceDeckId, targetDeckId, deleteSource) => {
      await invoke('srs_merge_decks', { sourceDeckId, targetDeckId, deleteSource });
      await get().fetchDecks();
    },

    applyDeck: (deck) =>
      set((s) => {
        const i = s.decks.findIndex((d) => d.id === deck.id);
        if (i >= 0) s.decks[i] = deck;
        else s.decks.unshift(deck);
      }),

    clearError: () =>
      set((s) => {
        s.error = null;
      }),
  })),
);
