import type { EnhancedWord } from '@/pages/podcast/studio-types';
import { cleanWord } from '@/pages/podcast/utils/words';

/** One line of the book track's subtitles, split into words the learner can pick. */
export function lineWords(text: string): EnhancedWord[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => ({
      text: word,
      cleanText: cleanWord(word),
      index,
      cefr: 'unknown' as EnhancedWord['cefr'],
      status: 'new' as const,
      isClickable: true,
    }));
}
