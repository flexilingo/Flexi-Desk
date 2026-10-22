import { useTranslation } from 'react-i18next';
import { Check, Minus, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scorecard as Card } from '../lib/types';

type Mark = 'pass' | 'near' | 'fail';

const MARK_CLASS: Record<Mark, string> = {
  pass: 'border-success/40 bg-success/10 text-success',
  near: 'border-warning/45 bg-warning/10 text-warning',
  fail: 'border-error/45 bg-error/10 text-error',
};
const MARK_ICON: Record<Mark, typeof Check> = { pass: Check, near: Minus, fail: X };

/** The score's own bar, coloured by how far along it is. */
const barClass = (score: number) =>
  score >= 85 ? 'bg-success' : score >= 55 ? 'bg-warning' : 'bg-error';

export const criteriaOf = (card: Card): { key: string; mark: Mark }[] => [
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
    : [{ key: 'elision', mark: (card.criteria.elision ? 'pass' : 'fail') as Mark }]),
];

/**
 * What the learner's own AI saw, criterion by criterion. One "wrong" teaches
 * nothing; "the meaning is right, the grammar is right, one accent is missing"
 * teaches exactly the thing to fix. The hints (register, naturalness, the kind of
 * mistake) are there only when the model was sure, and a hint never changes the
 * verdict above it.
 */
export function Scorecard({ card }: { card: Card }) {
  const { t } = useTranslation('sentences', { keyPrefix: 'scorecard' });
  const criteria = criteriaOf(card);

  const hints: string[] = [];
  if (card.hints.register) hints.push(t(`register.${card.hints.register}`));
  if (card.hints.natural === true) hints.push(t('natural.yes'));
  if (card.hints.natural === false) hints.push(t('natural.no'));
  if (card.hints.errorType) hints.push(t(`error.${card.hints.errorType}`));

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-3" data-testid="scorecard">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {t('title')}
        </span>
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border" aria-hidden>
          <div
            className={cn('h-full rounded-full', barClass(card.score))}
            style={{ width: `${card.score}%` }}
          />
        </div>
        <span className="text-sm font-extrabold tabular-nums text-foreground">
          {card.score}
          <span className="text-xs font-semibold text-caption">/100</span>
        </span>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {criteria.map(({ key, mark }) => {
          const Icon = MARK_ICON[mark];
          return (
            <li
              key={key}
              title={t(`why.${key}.${mark}`)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold',
                MARK_CLASS[mark],
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`criteria.${key}`)}
            </li>
          );
        })}
      </ul>

      {criteria.some((c) => c.mark !== 'pass') && (
        <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground">
          {criteria
            .filter((c) => c.mark !== 'pass')
            .map(({ key, mark }) => (
              <li key={key}>· {t(`why.${key}.${mark}`)}</li>
            ))}
        </ul>
      )}

      {hints.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border pt-2 text-sm leading-relaxed text-muted-foreground">
          {hints.map((hint) => (
            <li key={hint}>· {hint}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
