import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import type {
  Algorithm,
  CardFull,
  CardType,
  DeckWithStats,
  Rating,
  ReviewMode,
  ReviewSession,
  ReviewSettings,
  SessionSummary,
  SRSSessionStats,
  RawDeckWithStats,
  RawCardFull,
  RawReviewSession,
  RawSessionSummary,
} from '../types';
import { mapCard, mapDeck, mapSession, mapSummary, DEFAULT_REVIEW_SETTINGS } from '../types';

const MAX_REQUEUE = 3;

interface ReviewState {
  // ── Deck browsing ──
  decks: DeckWithStats[];
  isLoadingDecks: boolean;
  selectedDeckId: string | null;
  deckCards: CardFull[];
  isLoadingCards: boolean;

  // ── Session ──
  session: ReviewSession | null;
  currentCard: CardFull | null;
  isFlipped: boolean;
  mode: ReviewMode;
  cardsRemaining: number;
  isLoadingCard: boolean;
  isRating: boolean;
  cardStartTime: number | null;

  // ── Card queue ──
  cardQueue: CardFull[];
  queueIndex: number;
  requeueTracker: Record<string, number>;
  cardHistory: number[]; // stack of previous queue indices

  // ── SRS stats ──
  sessionSRSStats: SRSSessionStats;

  // ── Card composition ──
  remainingByType: { new: number; review: number; learning: number };

  // ── Settings ──
  reviewSettings: ReviewSettings;

  // ── UI dialog states ──
  isSettingsOpen: boolean;
  isEditCardOpen: boolean;
  isAddToDeckOpen: boolean;
  isDictionaryOpen: boolean;
  dictionaryWord: string | null;

  // ── Summary ──
  sessionComplete: boolean;
  summary: SessionSummary | null;

  // ── Error ──
  error: string | null;

  // ── Deck actions ──
  fetchDecks: () => Promise<void>;
  createDeck: (name: string, language: string, algorithm: Algorithm, description?: string) => Promise<void>;
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

  // ── Session actions ──
  startSession: (deckId: string, limit?: number) => Promise<void>;
  loadSessionCards: (session: ReviewSession) => Promise<void>;
  flipCard: () => void;
  rateCard: (rating: Rating) => Promise<void>;
  completeSession: () => Promise<void>;
  resetSession: () => void;

  // ── Queue actions ──
  goToPreviousCard: () => void;

  // ── Card edit actions ──
  updateCardInSession: (cardId: string, front: string, translation: string) => Promise<void>;
  deleteCardFromSession: (cardId: string) => Promise<void>;

  // ── Settings actions ──
  loadReviewSettings: () => Promise<void>;
  saveReviewSetting: <K extends keyof ReviewSettings>(key: K, value: ReviewSettings[K]) => Promise<void>;

  // ── UI actions ──
  setSettingsOpen: (open: boolean) => void;
  setEditCardOpen: (open: boolean) => void;
  setAddToDeckOpen: (open: boolean) => void;
  setDictionaryOpen: (open: boolean, word?: string | null) => void;

  clearError: () => void;
}

function computeRemainingByType(queue: CardFull[]): { new: number; review: number; learning: number } {
  const result = { new: 0, review: 0, learning: 0 };
  for (const card of queue) {
    if (card.state === 'new') result.new++;
    else if (card.state === 'learning' || card.state === 'relearning') result.learning++;
    else result.review++;
  }
  return result;
}

export const useReviewStore = create<ReviewState>()(
  immer((set, get) => ({
    // ── Initial state ──
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

    cardQueue: [],
    queueIndex: 0,
    requeueTracker: {},
    cardHistory: [],

    sessionSRSStats: {
      boxPromotions: 0,
      boxDemotions: 0,
      newlyMastered: 0,
      newCardsLearned: 0,
      dueCardsReviewed: 0,
    },

    remainingByType: { new: 0, review: 0, learning: 0 },

    reviewSettings: { ...DEFAULT_REVIEW_SETTINGS },

    isSettingsOpen: false,
    isEditCardOpen: false,
    isAddToDeckOpen: false,
    isDictionaryOpen: false,
    dictionaryWord: null,

    sessionComplete: false,
    summary: null,
    error: null,

    // ══════════════════════════════════════════════════
    // ── Deck actions (unchanged) ──
    // ══════════════════════════════════════════════════

    fetchDecks: async () => {
      set((s) => { s.isLoadingDecks = true; s.error = null; });
      try {
        const raw = await invoke<RawDeckWithStats[]>('srs_list_decks');
        set((s) => { s.decks = raw.map(mapDeck); s.isLoadingDecks = false; });
      } catch (e) {
        set((s) => { s.error = String(e); s.isLoadingDecks = false; });
      }
    },

    createDeck: async (name, language, algorithm, description) => {
      try {
        await invoke<RawDeckWithStats>('srs_create_deck', { name, language, algorithm, description });
        await get().fetchDecks();
      } catch (e) {
        set((s) => { s.error = String(e); });
      }
    },

    deleteDeck: async (id) => {
      try {
        await invoke('srs_delete_deck', { id });
        await get().fetchDecks();
        set((s) => { if (s.selectedDeckId === id) s.selectedDeckId = null; });
      } catch (e) {
        set((s) => { s.error = String(e); });
      }
    },

    selectDeck: (id) => {
      set((s) => { s.selectedDeckId = id; });
    },

    fetchDeckCards: async (deckId) => {
      set((s) => { s.isLoadingCards = true; });
      try {
        const raw = await invoke<RawCardFull[]>('srs_get_deck_cards', { deckId, page: 1, pageSize: 200 });
        set((s) => { s.deckCards = raw.map(mapCard); s.isLoadingCards = false; });
      } catch (e) {
        set((s) => { s.error = String(e); s.isLoadingCards = false; });
      }
    },

    addCard: async (input) => {
      try {
        await invoke('srs_add_card', {
          deckId: input.deckId, word: input.word, language: input.language,
          translation: input.translation, definition: input.definition,
          pos: input.pos, cefrLevel: input.cefrLevel,
          exampleSentence: input.exampleSentence, notes: input.notes,
        });
        await get().fetchDeckCards(input.deckId);
        await get().fetchDecks();
      } catch (e) {
        set((s) => { s.error = String(e); });
      }
    },

    deleteCard: async (cardId) => {
      const deckId = get().selectedDeckId;
      try {
        await invoke('srs_delete_card', { cardId });
        if (deckId) await get().fetchDeckCards(deckId);
        await get().fetchDecks();
      } catch (e) {
        set((s) => { s.error = String(e); });
      }
    },

    mergeDecks: async (sourceDeckId, targetDeckId, deleteSource) => {
      try {
        await invoke('srs_merge_decks', { sourceDeckId, targetDeckId, deleteSource });
        await get().fetchDecks();
      } catch (e) {
        set((s) => { s.error = String(e); });
      }
    },

    // ══════════════════════════════════════════════════
    // ── Session actions (rewritten for queue) ──
    // ══════════════════════════════════════════════════

    startSession: async (deckId, limit) => {
      set((s) => { s.isLoadingCard = true; s.error = null; });
      try {
        const rawSession = await invoke<RawReviewSession>('srs_start_session', { deckId, limit });
        const session = mapSession(rawSession);

        if (session.totalCards === 0) {
          set((s) => { s.error = 'No cards due for review'; s.isLoadingCard = false; });
          return;
        }

        // Load all session cards in parallel
        const cardPromises = Array.from({ length: session.totalCards }, (_, i) =>
          invoke<RawCardFull>('srs_get_session_card', { sessionId: session.id, index: i }),
        );
        const rawCards = await Promise.all(cardPromises);
        const cards = rawCards.map(mapCard);

        set((s) => {
          s.session = session;
          s.cardQueue = cards;
          s.queueIndex = 0;
          s.currentCard = cards[0];
          s.isFlipped = false;
          s.cardsRemaining = cards.length;
          s.remainingByType = computeRemainingByType(cards);
          s.requeueTracker = {};
          s.cardHistory = [];
          s.sessionComplete = false;
          s.summary = null;
          s.isLoadingCard = false;
          s.cardStartTime = Date.now();
          s.sessionSRSStats = {
            boxPromotions: 0, boxDemotions: 0,
            newlyMastered: 0, newCardsLearned: 0, dueCardsReviewed: 0,
          };
        });
      } catch (e) {
        set((s) => { s.error = String(e); s.isLoadingCard = false; });
      }
    },

    loadSessionCards: async (session) => {
      set((s) => { s.isLoadingCard = true; s.error = null; });
      try {
        const cardPromises = Array.from({ length: session.totalCards }, (_, i) =>
          invoke<RawCardFull>('srs_get_session_card', { sessionId: session.id, index: i }),
        );
        const rawCards = await Promise.all(cardPromises);
        const cards = rawCards.map(mapCard);

        set((s) => {
          s.session = session;
          s.cardQueue = cards;
          s.queueIndex = 0;
          s.currentCard = cards[0] ?? null;
          s.isFlipped = false;
          s.cardsRemaining = cards.length;
          s.remainingByType = computeRemainingByType(cards);
          s.requeueTracker = {};
          s.cardHistory = [];
          s.sessionComplete = false;
          s.summary = null;
          s.isLoadingCard = false;
          s.cardStartTime = Date.now();
          s.sessionSRSStats = {
            boxPromotions: 0, boxDemotions: 0,
            newlyMastered: 0, newCardsLearned: 0, dueCardsReviewed: 0,
          };
        });
      } catch (e) {
        set((s) => { s.error = String(e); s.isLoadingCard = false; });
      }
    },

    flipCard: () => {
      set((s) => { s.isFlipped = true; });
    },

    rateCard: async (rating) => {
      const { session, currentCard, cardStartTime, cardQueue, queueIndex, requeueTracker } = get();
      if (!session || !currentCard) return;

      const timeSpentMs = cardStartTime ? Date.now() - cardStartTime : 0;
      set((s) => { s.isRating = true; });

      try {
        const result = await invoke<{ should_requeue: boolean; was_correct: boolean }>('srs_rate_card', {
          sessionId: session.id,
          cardId: currentCard.id,
          rating,
          timeSpentMs,
        });

        // Use backend's algorithm-specific correctness and requeue decisions
        const oldState = currentCard.state;
        const isCorrect = result.was_correct;
        const shouldRequeue = result.should_requeue;

        set((s) => {
          // Update session counters
          s.session!.reviewedCards += 1;
          if (isCorrect) s.session!.correctCount += 1;

          // Track SRS stats
          if (oldState === 'new') s.sessionSRSStats.newCardsLearned += 1;
          if (oldState === 'review' || oldState === 'relearning') s.sessionSRSStats.dueCardsReviewed += 1;
          if (isCorrect) s.sessionSRSStats.boxPromotions += 1;
          if (!isCorrect && oldState !== 'new') s.sessionSRSStats.boxDemotions += 1;

          // Requeue logic (from backend)
          const currentRequeueCount = requeueTracker[currentCard.id] ?? 0;

          // Push current index to history for "previous" navigation
          s.cardHistory.push(queueIndex);

          if (shouldRequeue && currentRequeueCount < MAX_REQUEUE) {
            // Move card to end of queue
            const card = s.cardQueue[s.queueIndex];
            s.cardQueue.splice(s.queueIndex, 1);
            s.cardQueue.push(card);
            s.requeueTracker[currentCard.id] = currentRequeueCount + 1;
            // queueIndex stays the same (next card shifted into current position)
          } else {
            // Remove card from queue
            s.cardQueue.splice(s.queueIndex, 1);
            // If we removed the last item and index is now out of bounds, don't advance
            if (s.queueIndex >= s.cardQueue.length && s.cardQueue.length > 0) {
              s.queueIndex = 0;
            }
          }

          // Update remaining
          s.cardsRemaining = s.cardQueue.length;
          s.remainingByType = computeRemainingByType(s.cardQueue);

          if (s.cardQueue.length === 0) {
            // Session complete — will call completeSession after set
            s.currentCard = null;
            s.isRating = false;
          } else {
            // Show next card
            if (s.queueIndex >= s.cardQueue.length) s.queueIndex = 0;
            s.currentCard = s.cardQueue[s.queueIndex];
            s.isFlipped = false;
            s.isRating = false;
            s.cardStartTime = Date.now();
          }
        });

        // Complete session if queue empty
        if (get().cardQueue.length === 0) {
          await get().completeSession();
        }
      } catch (e) {
        set((s) => { s.error = String(e); s.isRating = false; });
      }
    },

    completeSession: async () => {
      const { session, sessionSRSStats } = get();
      if (!session) return;
      try {
        const rawSummary = await invoke<RawSessionSummary>('srs_complete_session', { sessionId: session.id });
        const summary = mapSummary(rawSummary);
        set((s) => {
          s.sessionComplete = true;
          s.summary = summary;
        });

        // Log activity to dashboard (fire-and-forget)
        const durationMinutes = Math.max(1, Math.round(summary.durationSeconds / 60));
        invoke('dashboard_log_activity', {
          studyMinutes: durationMinutes,
          wordsLearned: sessionSRSStats.newCardsLearned,
          reviewsCompleted: summary.reviewedCards,
        }).catch(() => {});

        // Log session completion event
        invoke('dashboard_log_event', {
          activityType: 'session_complete',
          module: 'review',
          description: `Reviewed ${summary.reviewedCards} cards, ${Math.round(summary.accuracy * 100)}% accuracy`,
        }).catch(() => {});

        // Update streak
        invoke('dashboard_check_streak').catch(() => {});
      } catch (e) {
        set((s) => { s.error = String(e); });
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
        s.cardQueue = [];
        s.queueIndex = 0;
        s.requeueTracker = {};
        s.cardHistory = [];
        s.sessionSRSStats = {
          boxPromotions: 0, boxDemotions: 0,
          newlyMastered: 0, newCardsLearned: 0, dueCardsReviewed: 0,
        };
        s.remainingByType = { new: 0, review: 0, learning: 0 };
      });
    },

    // ══════════════════════════════════════════════════
    // ── Queue navigation ──
    // ══════════════════════════════════════════════════

    goToPreviousCard: () => {
      const { cardHistory, cardQueue } = get();
      if (cardHistory.length === 0) return;

      set((s) => {
        const prevIndex = s.cardHistory.pop()!;
        // Clamp to valid range
        const idx = Math.min(prevIndex, s.cardQueue.length - 1);
        s.queueIndex = idx;
        s.currentCard = s.cardQueue[idx] ?? null;
        s.isFlipped = false;
        s.cardStartTime = Date.now();
      });
    },

    // ══════════════════════════════════════════════════
    // ── Card editing ──
    // ══════════════════════════════════════════════════

    updateCardInSession: async (cardId, front, translation) => {
      try {
        await invoke('srs_update_card', { cardId, front, translation });
        set((s) => {
          const idx = s.cardQueue.findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            s.cardQueue[idx].front = front;
            s.cardQueue[idx].translation = translation;
          }
          if (s.currentCard?.id === cardId) {
            s.currentCard.front = front;
            s.currentCard.translation = translation;
          }
        });
      } catch (e) {
        throw e;
      }
    },

    deleteCardFromSession: async (cardId) => {
      try {
        await invoke('srs_delete_card', { cardId });
        set((s) => {
          const idx = s.cardQueue.findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            s.cardQueue.splice(idx, 1);
            if (s.queueIndex >= s.cardQueue.length && s.cardQueue.length > 0) {
              s.queueIndex = s.cardQueue.length - 1;
            }
            s.cardsRemaining = s.cardQueue.length;
            s.remainingByType = computeRemainingByType(s.cardQueue);
            s.currentCard = s.cardQueue[s.queueIndex] ?? null;
            s.isFlipped = false;
            s.cardStartTime = Date.now();
          }
        });
        if (get().cardQueue.length === 0) {
          await get().completeSession();
        }
      } catch (e) {
        throw e;
      }
    },

    // ══════════════════════════════════════════════════
    // ── Settings ──
    // ══════════════════════════════════════════════════

    loadReviewSettings: async () => {
      try {
        const raw = await getSetting('review_settings');
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<ReviewSettings>;
          set((s) => {
            s.reviewSettings = { ...DEFAULT_REVIEW_SETTINGS, ...parsed };
          });
        }
      } catch {
        // Keep defaults
      }
    },

    saveReviewSetting: async (key, value) => {
      set((s) => {
        (s.reviewSettings as Record<string, unknown>)[key] = value;
      });
      const settings = get().reviewSettings;
      await setSetting('review_settings', JSON.stringify(settings));
    },

    // ══════════════════════════════════════════════════
    // ── UI state ──
    // ══════════════════════════════════════════════════

    setSettingsOpen: (open) => { set((s) => { s.isSettingsOpen = open; }); },
    setEditCardOpen: (open) => { set((s) => { s.isEditCardOpen = open; }); },
    setAddToDeckOpen: (open) => { set((s) => { s.isAddToDeckOpen = open; }); },
    setDictionaryOpen: (open, word = null) => {
      set((s) => { s.isDictionaryOpen = open; s.dictionaryWord = word ?? s.dictionaryWord; });
    },

    clearError: () => { set((s) => { s.error = null; }); },
  })),
);
