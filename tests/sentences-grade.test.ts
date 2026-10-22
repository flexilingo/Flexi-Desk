import { describe, it, expect } from 'vitest';
import { bare, diffWords, grade, isCorrect, shape, withScorecard, type Grade } from '@/pages/sentences/lib/grade';
import { ipaGroups, hasLiaison, ipaWithTies } from '@/pages/sentences/lib/ipa';
import type { Scorecard } from '@/pages/sentences/lib/types';

/**
 * The accent-aware grader — the website's `grade.ts`. Every decision here is one the website
 * makes (and `sentences-app/grade.ts` on the server): these are the parity cases.
 */
const card = {
  text: "Où est-ce qu'il habite ?",
  accepted: ['Ou est-ce qu’il habite'],
  analysis: {
    variants: [
      { text: "Où il habite ?", register: 'familiar' as const },
      { text: "Où est-ce qu'il habite ?", register: 'standard' as const },
      { text: 'Où habite-t-il ?', register: 'formal' as const },
    ],
  },
};

describe('grade: the four verdicts', () => {
  it('exact — punctuation, case, spacing and the curly apostrophe never decide', () => {
    for (const typed of ["Où est-ce qu'il habite ?", "où est-ce qu’il habite", "  OÙ  est-ce qu'il   habite!  ", "où est-ce qu`il habite?"]) {
      expect(grade(card, typed)).toEqual({ verdict: 'exact', diff: [] });
    }
  });

  it('exact — a listed alternative spelling is the same answer', () => {
    expect(grade(card, 'Ou est-ce qu’il habite').verdict).toBe('exact');
  });

  it('accents — right letters, a diacritic dropped: a real mistake that is not "wrong"', () => {
    const g = grade({ ...card, accepted: [] }, "Ou est-ce qu'il habite");
    expect(g.verdict).toBe('accents');
    expect(g.diff.some((p) => p.kind === 'missing')).toBe(true);
  });

  it('variant — a different correct register is named, with no diff', () => {
    const g = grade(card, 'Où habite-t-il ?');
    expect(g.verdict).toBe('variant');
    expect(g.variant?.register).toBe('formal');
    expect(g.diff).toEqual([]);
  });

  it('variant needs the register to differ from the card itself', () => {
    expect(grade(card, "où est-ce qu'il habite").verdict).toBe('exact');
  });

  it('variant also forgives accents inside the listed variant', () => {
    expect(grade(card, 'Ou habite-t-il').verdict).toBe('variant');
  });

  it('wrong — everything else, with where it went wrong', () => {
    const g = grade(card, 'Où est-ce que tu habites ?');
    expect(g.verdict).toBe('wrong');
    expect(g.diff.map((p) => p.kind)).toContain('extra');
    expect(g.diff.map((p) => p.kind)).toContain('missing');
  });

  it('an empty answer is wrong, and the whole sentence is what was missing', () => {
    const g = grade(card, '   ');
    expect(g.verdict).toBe('wrong');
    expect(g.diff).toEqual([{ kind: 'missing', text: "où est-ce qu'il habite" }]);
  });

  it('works for a card with no accepted list and no variants (English)', () => {
    expect(grade({ text: 'I am a student.', accepted: [], analysis: {} }, 'i am a student').verdict).toBe('exact');
    expect(grade({ text: 'I am a student.', accepted: undefined as never, analysis: {} }, 'I am student').verdict).toBe('wrong');
  });
});

describe('grade: helpers', () => {
  it('shape keeps diacritics, bare folds them', () => {
    expect(shape('Élève !')).toBe('élève');
    expect(bare('Élève !')).toBe('eleve');
  });

  it("elision is one word in the diff: qu'il is not two mistakes", () => {
    const parts = diffWords(['où', "qu'il", 'habite'], ['où', 'habite']);
    expect(parts).toEqual([
      { kind: 'same', text: 'où' },
      { kind: 'missing', text: "qu'il" },
      { kind: 'same', text: 'habite' },
    ]);
  });

  it('diff merges runs so a missing phrase is one chip', () => {
    const parts = diffWords(['vous', 'parlez', 'français'], ['français']);
    expect(parts[0]).toEqual({ kind: 'missing', text: 'vous parlez' });
  });

  it('isCorrect: exact, accents and variant count; wrong does not', () => {
    expect(['exact', 'accents', 'variant'].every((v) => isCorrect(v as never))).toBe(true);
    expect(isCorrect('wrong')).toBe(false);
  });
});

describe('withScorecard: the learner\'s own AI folded into the static grade', () => {
  const base: Grade = { verdict: 'wrong', diff: [{ kind: 'missing', text: 'x' }] };
  const accepted = (spelling: Scorecard['criteria']['spelling']): Scorecard => ({
    accepted: true,
    score: 95,
    criteria: { meaning: true, grammar: true, spelling, elision: null },
    hints: {},
  });

  it('rejected stays wrong and keeps the diff — seeing where is the feedback', () => {
    const rejected: Scorecard = { ...accepted('ok'), accepted: false };
    const g = withScorecard(base, rejected);
    expect(g).toMatchObject({ verdict: 'wrong', diff: base.diff });
    expect(g.card).toBe(rejected);
  });

  it('accepted with a spelling slip is accents and keeps the diff', () => {
    expect(withScorecard(base, accepted('accents'))).toMatchObject({ verdict: 'accents', diff: base.diff });
  });

  it('accepted otherwise is a variant with no diff and no register: "correct French the card did not list"', () => {
    const g = withScorecard(base, accepted('ok'));
    expect(g.verdict).toBe('variant');
    expect(g.diff).toEqual([]);
    expect(g.variant).toBeUndefined();
  });
});

describe('transcription ties (liaison)', () => {
  it('ties a liaison consonant to the vowel that follows', () => {
    const groups = ipaGroups('Les enfants', '/lez ɑ̃.fɑ̃/');
    expect(groups[0].tied).toBe(true);
    expect(ipaWithTies('Les enfants', '/lez ɑ̃.fɑ̃/')).toBe('lez‿ɑ̃.fɑ̃');
    expect(hasLiaison('Les enfants', '/lez ɑ̃.fɑ̃/')).toBe(true);
  });
  it('leaves a line alone when the words do not line up', () => {
    expect(hasLiaison('Je suis étudiant', '/ʒə sɥi.z‿e/')).toBe(false);
  });
});
