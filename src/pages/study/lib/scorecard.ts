import type { Scorecard } from '../types';

export type Mark = 'pass' | 'near' | 'fail';

/** The marks the scorecard shows, per criterion (the elision line is French's, so it is absent elsewhere). */
export function criteriaOf(
  card: Scorecard,
): { key: 'meaning' | 'grammar' | 'spelling' | 'elision'; mark: Mark }[] {
  return [
    { key: 'meaning', mark: card.criteria.meaning ? 'pass' : 'fail' },
    { key: 'grammar', mark: card.criteria.grammar ? 'pass' : 'fail' },
    {
      key: 'spelling',
      mark:
        card.criteria.spelling === 'ok'
          ? 'pass'
          : card.criteria.spelling === 'accents'
            ? 'near'
            : 'fail',
    },
    ...(card.criteria.elision === null
      ? []
      : [{ key: 'elision' as const, mark: (card.criteria.elision ? 'pass' : 'fail') as Mark }]),
  ];
}
