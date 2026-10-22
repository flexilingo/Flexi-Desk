import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LevelBucket } from '../lib/word-select';

/**
 * CEFR level of each word of a window in ONE call (`podcast_get_words_cefr`, the episode's language).
 * Words the language has no table for (or that are unrated) come back as NR. `ready` is true once the
 * answer is in; a failed call is also "ready" with everything NR, so the card never waits forever.
 */
export function useWordLevels(words: string[], lang: string) {
  const [map, setMap] = useState<Record<string, LevelBucket>>({});
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const key = `${lang}:${words.join('|')}`;

  useEffect(() => {
    if (words.length === 0) return;
    let cancelled = false;
    invoke<[string, string][]>('podcast_get_words_cefr', { words, lang })
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, LevelBucket> = {};
        for (const [w, level] of rows) next[w.toLowerCase()] = level as LevelBucket;
        setMap(next);
        setDoneFor(key);
      })
      .catch(() => {
        if (cancelled) return;
        setMap({});
        setDoneFor(key);
      });
    return () => {
      cancelled = true;
    };
  }, [key, words, lang]);

  const levelOf = useCallback(
    (word: string): LevelBucket => map[word.toLowerCase()] ?? 'NR',
    [map],
  );
  return { levelOf, ready: words.length === 0 || doneFor === key };
}
