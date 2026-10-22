/**
 * Word selection for the pre-teach card (and later, cloze blanks). Pure.
 *
 * The job is not "the rarest words" — it is "the words most likely to be the
 * reason this clip is hard for THIS user", which is a different ranking:
 * frequency inside the clip matters (a word said three times is worth 20
 * seconds), proper nouns do not, and anything the user already owns is noise.
 */

/** CEFR level of a word, or NR when it has none. */
export type LevelBucket = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'NR';

/** Function words carry the grammar, not the comprehension load. */
export const STOPWORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'cannot',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'ought',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
  'get',
  'got',
  'go',
  'going',
  'gone',
  'come',
  'came',
  'know',
  'known',
  'think',
  'thought',
  'say',
  'said',
  'see',
  'seen',
  'make',
  'made',
  'take',
  'took',
  'want',
  'wanted',
  'like',
  'liked',
  'look',
  'looked',
  'use',
  'used',
  'one',
  'two',
  'three',
  'really',
  'well',
  'also',
  'back',
  'even',
  'still',
  'much',
  'many',
  'lot',
  'thing',
  'things',
  'way',
  'yeah',
  'okay',
  'ok',
  'right',
  'sure',
  'gonna',
  'wanna',
  'kind',
  'sort',
  'actually',
  'maybe',
  'probably',
  'something',
  'anything',
  'nothing',
  'everything',
  'someone',
  'anyone',
  'everyone',
  'because',
]);

/** Higher = more worth 20 seconds of the user's attention. */
const LEVEL_WEIGHT: Record<LevelBucket, number> = {
  C2: 6,
  C1: 5,
  B2: 4,
  B1: 2,
  A2: 0,
  A1: 0,
  // Not rated: usually a rare or domain word, occasionally a typo. Mildly interesting.
  NR: 1.5,
};

const LEVEL_INDEX: Record<LevelBucket, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
  NR: 3,
};

export interface WordOccurrence {
  word: string;
  /** Times it appears in the clip. */
  occurrences: number;
  /** Whether it ever appeared capitalised away from a sentence start. */
  looksProper: boolean;
  /** The first sentence it appeared in, for the card. */
  sentence: string;
}

const WORD_RE = /^[a-z][a-z'-]*$/i;

/**
 * Unicode equivalents of the two rules above.
 *
 * The ASCII pair silently mangles every accented language: the trailing strip
 * turns `café` into `caf` — a garbage candidate that reaches the levels
 * endpoint and then a flashcard — and `développement` fails WORD_RE outright
 * and is dropped. Harmless for the English transcripts this file was written
 * for; wrong for a French page.
 */
const WORD_RE_UNICODE = /^[\p{L}][\p{L}\p{M}'-]*$/u;
const STRIP_UNICODE = /^[^\p{L}\p{M}']+|[^\p{L}\p{M}']+$/gu;

export interface ExtractOptions {
  /**
   * Accept any Unicode letter. OFF by default so the listening program, which
   * feeds this English transcripts, keeps byte-identical behaviour.
   */
  unicode?: boolean;
  /** Function words to drop. Defaults to the English set. */
  stopwords?: Set<string>;
  /**
   * Shortest token accepted. Three is right for English, where a two-letter
   * token is almost always a function word — and wrong for Chinese, where a
   * single Han character is a whole word.
   */
  minLength?: number;
}

/**
 * Extract candidate content words from a clip's text, with the context each
 * needs to be ranked and displayed.
 */
export function extractCandidates(
  segmentTexts: string[],
  { unicode = false, stopwords = STOPWORDS, minLength = 3 }: ExtractOptions = {},
): WordOccurrence[] {
  const map = new Map<string, WordOccurrence>();
  const strip = unicode ? STRIP_UNICODE : /^[^A-Za-z']+|[^A-Za-z']+$/g;
  const wordRe = unicode ? WORD_RE_UNICODE : WORD_RE;

  for (const raw of segmentTexts) {
    const sentence = raw.trim();
    // Split into tokens but remember position, so a capital at index 0 is not
    // mistaken for a proper noun.
    const tokens = sentence.split(/\s+/);
    tokens.forEach((tokenRaw, idx) => {
      strip.lastIndex = 0;
      const token = tokenRaw.replace(strip, '');
      if (token.length < minLength) return;
      if (!wordRe.test(token)) return;
      const key = token.toLowerCase();
      if (stopwords.has(key)) return;

      const capitalisedMidSentence = idx > 0 && /^[A-Z]/.test(token);
      const existing = map.get(key);
      if (existing) {
        existing.occurrences += 1;
        // One lowercase sighting is enough to clear the proper-noun suspicion.
        existing.looksProper = existing.looksProper && capitalisedMidSentence;
      } else {
        map.set(key, {
          word: key,
          occurrences: 1,
          looksProper: capitalisedMidSentence,
          sentence,
        });
      }
    });
  }

  return [...map.values()];
}

export interface PreteachWord {
  word: string;
  level: LevelBucket;
  sentence: string;
  occurrences: number;
  score: number;
}

export interface RankOptions {
  levelOf: (word: string) => LevelBucket;
  /** The learner's own level, so "hard" means hard *for them*. */
  userLevel?: LevelBucket;
  /**
   * Words the user already has in a deck or has mastered. Phase 2 —
   * phase 1 passes nothing and the list is still good.
   */
  known?: Set<string>;
  mastered?: Set<string>;
  count: number;
}

export function rankPreteach(
  candidates: WordOccurrence[],
  { levelOf, userLevel = 'B1', known, mastered, count }: RankOptions,
): PreteachWord[] {
  const userIdx = LEVEL_INDEX[userLevel];

  const scored = candidates.map((c) => {
    const level = levelOf(c.word);
    let score = LEVEL_WEIGHT[level];

    if (LEVEL_INDEX[level] > userIdx) score += 2;
    // Recurs in the clip -> genuinely worth pre-teaching.
    score += (1.0 * Math.min(c.occurrences, 3)) / 3;
    if (c.looksProper) score -= 1.5;
    if (known?.has(c.word)) score -= 4;
    if (mastered?.has(c.word)) score -= 6;

    return { word: c.word, level, sentence: c.sentence, occurrences: c.occurrences, score };
  });

  return scored
    .filter((w) => w.score > 0)
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .slice(0, count);
}

/** Unique content words across a whole window — the single batch levels fetch. */
export function contentWordsOf(segmentTexts: string[]): string[] {
  return extractCandidates(segmentTexts).map((c) => c.word);
}
