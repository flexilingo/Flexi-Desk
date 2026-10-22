import type { PracticeSentence, Scorecard, Variant } from './types';

/**
 * Grading a produced sentence — the website's `grade.ts`, character for character
 * in its decisions (and the server's `sentences-app/grade.ts`).
 *
 * `exact` is the one verdict that is not an opinion: the learner typed the
 * sentence. Everything else goes to the learner's own AI when one is set up, and
 * this stays the verdict (and the diff) when it is not, or when it cannot be asked.
 *
 *   exact     they wrote it
 *   accents   they wrote it and dropped a diacritic or an apostrophe
 *   variant   they wrote a DIFFERENT correct sentence — another register
 *   wrong     everything else, and then they need to see WHERE
 */
export type Verdict = 'exact' | 'accents' | 'variant' | 'wrong';

export type DiffPart = {
  /** `same` in both, `missing` only in the answer, `extra` only in what they typed. */
  kind: 'same' | 'missing' | 'extra';
  text: string;
};

export type Grade = {
  verdict: Verdict;
  /** Set when `verdict` is `variant`: which register they actually produced. */
  variant?: Variant;
  /** Word-level, against the expected sentence. Empty when exact. */
  diff: DiffPart[];
  /** The answer judge's scorecard, when the learner's own AI judged the answer. */
  card?: Scorecard;
};

/** Punctuation, case and spacing only. Diacritics SURVIVE — that is the point. */
export const shape = (s: string) =>
  s
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[.,;:!?«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** As above, and diacritics folded away too. Used only to detect `accents`. */
export const bare = (s: string) => shape(s).normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Words, with the apostrophe kept ATTACHED to the word before it (`qu'il` is one word). */
const words = (s: string) => shape(s).split(' ').filter(Boolean);

/** Longest common subsequence over words — the smallest honest diff. */
export function diffWords(expected: string[], given: string[]): DiffPart[] {
  const n = expected.length;
  const m = given.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        expected[i] === given[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += ` ${text}`;
    else parts.push({ kind, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (expected[i] === given[j]) {
      push('same', expected[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push('missing', expected[i]);
      i++;
    } else {
      push('extra', given[j]);
      j++;
    }
  }
  while (i < n) push('missing', expected[i++]);
  while (j < m) push('extra', given[j++]);
  return parts;
}

export function grade(
  sentence: Pick<PracticeSentence, 'text' | 'accepted' | 'analysis'>,
  answer: string,
): Grade {
  const given = answer.trim();
  if (!given) return { verdict: 'wrong', diff: diffWords(words(sentence.text), []) };

  // `accepted` is for spellings that are genuinely the same answer. It is NOT for
  // other registers — those are variants.
  const targets = [sentence.text, ...(sentence.accepted ?? [])];

  if (targets.some((t) => shape(t) === shape(given))) return { verdict: 'exact', diff: [] };

  if (targets.some((t) => bare(t) === bare(given))) {
    return { verdict: 'accents', diff: diffWords(words(sentence.text), words(given)) };
  }

  const variant = (sentence.analysis?.variants ?? []).find(
    (v) => bare(v.text) === bare(given) && bare(v.text) !== bare(sentence.text),
  );
  if (variant) return { verdict: 'variant', variant, diff: [] };

  return { verdict: 'wrong', diff: diffWords(words(sentence.text), words(given)) };
}

/** Did they get it right at all — for the score line. `variant` counts. */
export const isCorrect = (v: Verdict) => v === 'exact' || v === 'accents' || v === 'variant';

/**
 * The static grade with the learner's own AI's scorecard folded in — the website's
 * `judgeWithAi`, minus the model call (which the desk runs through
 * `lib/judge.ts`): a rejected answer is `wrong` and keeps the diff; an accepted one
 * is `accents` when the card says a diacritic slipped, `variant` otherwise.
 */
export function withScorecard(base: Grade, card: Scorecard): Grade {
  if (!card.accepted) return { verdict: 'wrong', diff: base.diff, card };
  const verdict: Verdict = card.criteria.spelling === 'accents' ? 'accents' : 'variant';
  return { verdict, diff: verdict === 'accents' ? base.diff : [], card };
}
