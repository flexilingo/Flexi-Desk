// The local-library side of a deck page: cards, tags and history, all in SQLite.

import { invoke } from '@tauri-apps/api/core';
import type { CardFull, RawCardFull } from '../types';
import { mapCard } from '../types';

export const CARDS_PAGE_SIZE = 20;

export async function listCards(
  deckId: string,
  opts: { page: number; search: string; tag: string | null; pageSize?: number },
): Promise<{ cards: CardFull[]; total: number }> {
  const pageSize = opts.pageSize ?? CARDS_PAGE_SIZE;
  const [raw, total] = await Promise.all([
    invoke<RawCardFull[]>('srs_get_deck_cards', {
      deckId,
      page: opts.page,
      pageSize,
      search: opts.search || null,
      tag: opts.tag,
    }),
    invoke<number>('srs_count_deck_cards', { deckId, search: opts.search || null, tag: opts.tag }),
  ]);
  return { cards: raw.map(mapCard), total };
}

export interface CardDraft {
  front: string;
  back: string;
  notes: string;
  tags: string[];
}

export async function addCard(deckId: string, language: string, draft: CardDraft): Promise<void> {
  await invoke('srs_add_card', {
    deckId,
    word: draft.front.trim(),
    language,
    translation: draft.back.trim(),
    notes: draft.notes || null,
    tags: draft.tags,
  });
}

export async function updateCard(cardId: string, draft: CardDraft): Promise<void> {
  await invoke('srs_update_card', {
    cardId,
    front: draft.front.trim(),
    back: draft.back.trim(),
    notes: draft.notes,
    tags: draft.tags,
    // Keep the dictionary row's meaning in step with the card's own.
    translation: draft.back.trim(),
  });
}

export async function deleteCard(cardId: string): Promise<void> {
  await invoke('srs_delete_card', { cardId });
}

export interface TagCount {
  tag: string;
  count: number;
}

export async function cardTags(deckId: string): Promise<TagCount[]> {
  return invoke<TagCount[]>('srs_deck_card_tags', { deckId });
}

export interface DeckSession {
  id: string;
  status: 'completed' | 'active' | 'abandoned';
  started_at: string;
  completed: number;
  total: number;
  correct: number;
  seconds: number;
}

export async function deckHistory(deckId: string): Promise<DeckSession[]> {
  return invoke<DeckSession[]>('srs_deck_history', { deckId, limit: 50 });
}

export interface DeckProgress {
  deck_progress: {
    total_cards: number;
    mastered_count: number;
    familiar_count: number;
    learning_count: number;
    new_count: number;
  };
  today_study: { due_count: number; new_available: number; total_session_size: number };
}

export async function deckProgress(deckId: string): Promise<DeckProgress> {
  return invoke<DeckProgress>('srs_get_deck_stats', { deckId });
}
