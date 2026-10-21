import { cleanWord, splitParagraphs, splitSentences, tokenize } from '@/components/lookup/tokenize';
import { extractCandidates, type WordOccurrence } from './word-select';
import { CHARACTER_LANGUAGES, STOPWORDS_BY_LANG } from './stopwords';

/**
 * Candidate words for one page, with the sentence each came from.
 *
 * Sentences are split with the reader's OWN tokenizer, so the `context` a word
 * carries into the deck is character-identical to the one the word dialog was
 * given when it was tapped — one source of truth for what "the sentence this
 * word is in" means.
 */
export function readerCandidates(pageText: string, language: string): WordOccurrence[] {
  const sentences = splitParagraphs(pageText).flatMap(splitSentences);
  const extra = STOPWORDS_BY_LANG[language];

  // `extractCandidates` splits on whitespace, which Chinese and Japanese do not
  // use — a whole clause would arrive as one "word" and become one absurd
  // flashcard. Re-joining the reader's own tokens with spaces hands it exactly
  // the units the page makes tappable, so a card is always something the
  // learner could have clicked.
  const tokenised = sentences.map((sentence) =>
    tokenize(sentence)
      .filter((tok) => tok.word)
      .map((tok) => cleanWord(tok.text))
      .filter(Boolean)
      .join(' '),
  );

  // extractCandidates stores whichever string it was handed as the word's
  // `sentence`, and that string becomes the card's context. Handing back the
  // space-joined token soup would put "the main branch will remain open" on the
  // card with its punctuation stripped, so map each one back to the real
  // sentence it came from.
  const originalOf = new Map<string, string>();
  tokenised.forEach((t, i) => {
    if (t && !originalOf.has(t)) originalOf.set(t, sentences[i]);
  });

  const found = extractCandidates(tokenised, {
    // Without this a French page yields `caf` instead of `café`.
    unicode: true,
    // A single Han character is a whole word; the English default of three
    // would drop every candidate a Chinese page has.
    minLength: CHARACTER_LANGUAGES.has(language) ? 1 : 3,
    ...(extra ? { stopwords: new Set(extra) } : {}),
  });

  return found.map((c) => ({ ...c, sentence: originalOf.get(c.sentence) ?? c.sentence }));
}
