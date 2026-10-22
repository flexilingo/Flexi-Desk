import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AddMode } from './lastDeck';
import { isAiSetupError } from '@/lib/aiSource';
import type { AIWordAnalysis, WordExample } from './types';

export interface AddWordInput {
  deckId: string;
  mode: AddMode;
  /** Front of the card. */
  word: string;
  /** Back of the card (basic mode); smart mode lets the model write the rest. */
  translation?: string;
  cefr?: string;
  pos?: string;
  context?: string;
  examples?: WordExample[];
  /** Source language of the word and the language the model explains in (smart mode). */
  source: string;
  target: string;
}

/**
 * Save one word into one deck: the add logic of AddToDeckSheet, shared so the
 * one-tap save goes through the same two paths. Basic writes the card as the
 * tab shows it; smart asks the on-device model first and falls back to basic
 * fields when the model fails for this one word (but not when it is not running).
 * Rejects with the error; the caller shows it.
 */
export function useAddWordToDeck() {
  return useCallback(async (input: AddWordInput): Promise<void> => {
    let analysis: AIWordAnalysis | null = null;
    if (input.mode === 'smart') {
      try {
        analysis = await invoke<AIWordAnalysis>('ai_word_analysis', {
          word: input.word,
          sentence: input.context ?? '',
          targetLanguage: input.target,
          sourceLanguage: input.source,
        });
      } catch (err) {
        if (isAiSetupError(err)) throw err;
      }
    }
    await invoke('srs_add_card', {
      deckId: input.deckId,
      word: input.word.trim().toLowerCase(),
      language: input.source,
      translation: analysis?.contextualTranslation ?? input.translation ?? null,
      definition: analysis?.definition ?? null,
      pos: analysis?.partOfSpeech ?? input.pos ?? null,
      cefrLevel: analysis?.difficulty ?? input.cefr ?? null,
      exampleSentence:
        analysis?.examples?.[0]?.source ?? input.examples?.[0]?.source ?? input.context ?? null,
      notes: analysis?.ipa ? `IPA: ${analysis.ipa}` : null,
    });
  }, []);
}

/** The code behind a failed add: a duplicate card, the model not running, or unknown. */
export function addErrorCode(err: unknown): string {
  const text = String(err);
  if (isAiSetupError(text)) return 'AI_NOT_READY';
  if (/UNIQUE|already|duplicate/i.test(text)) return 'CARD_DUPLICATE';
  return 'UNKNOWN_ERROR';
}
