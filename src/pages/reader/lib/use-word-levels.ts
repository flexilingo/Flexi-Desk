import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LevelBucket } from './word-select';

const CEFR = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

export interface WordLevels {
  /** A word's level; `NR` when the language has no table or the word is unrated. */
  levelOf: (word: string) => LevelBucket;
  /** The language has level data: the ranking may use it. False -> rank by frequency. */
  usable: boolean;
  /** The lookup has finished (successfully or not). */
  ready: boolean;
}

/**
 * Levels from the on-device frequency tables (`podcast_get_words_cefr`).
 *
 * The command answers with nothing at all for a language it has no table for,
 * so "usable" is simply "it answered with something" — no second list of
 * supported languages to keep in step with the Rust side. A failed call counts
 * as "no levels", never as an error: the picker falls back to frequency.
 */
export function useWordLevels(words: string[], language: string): WordLevels {
  const key = useMemo(
    () => [...new Set(words.map((w) => w.trim()).filter(Boolean))].sort(),
    [words],
  );
  const [state, setState] = useState<{ id: string; levels: Map<string, string> } | null>(null);
  const id = `${language}\n${key.join('\n')}`;

  useEffect(() => {
    if (key.length === 0) return;
    let cancelled = false;
    invoke<[string, string][]>('podcast_get_words_cefr', { words: key, lang: language })
      .catch(() => [] as [string, string][])
      .then((pairs) => {
        if (cancelled) return;
        const levels = new Map<string, string>();
        for (const [word, level] of pairs) levels.set(word.toLowerCase(), level.toUpperCase());
        setState({ id, levels });
      });
    return () => {
      cancelled = true;
    };
  }, [key, language, id]);

  const current = state?.id === id ? state.levels : null;
  const levelOf = useMemo(
    () =>
      (word: string): LevelBucket => {
        const level = current?.get(word.toLowerCase()) ?? '';
        return CEFR.has(level) ? (level as LevelBucket) : 'NR';
      },
    [current],
  );
  return {
    levelOf,
    usable: current !== null && current.size > 0,
    ready: key.length === 0 || current !== null,
  };
}
