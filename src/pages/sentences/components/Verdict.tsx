import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Grade } from '../lib/grade';
import type { PracticeSentence } from '../lib/types';
import { useLabel } from './labels';
import { SentenceText } from './SentenceText';
import { Scorecard } from './Scorecard';

/**
 * What happened, and where.
 *
 * `variant` is the case worth the extra branch: they wrote correct French at a
 * register the round did not ask for. Marking that wrong would be a lie, and
 * marking it simply right would teach that the three French question forms are
 * interchangeable — which is precisely what these cards exist to prevent.
 */
export function Verdict({
  sentence,
  result,
  lang,
}: {
  sentence: Pick<PracticeSentence, 'text' | 'ipa'>;
  result: Grade;
  lang: string;
}) {
  const { t } = useTranslation('sentences');
  const label = useLabel();

  const tone =
    result.verdict === 'exact'
      ? 'border-success/50 bg-success/10'
      : result.verdict === 'wrong'
        ? 'border-accent/60 bg-accent/10'
        : 'border-warning/50 bg-warning/10';

  return (
    <div
      className={cn('mt-5 rounded-lg border p-4', tone)}
      data-testid="verdict"
      data-verdict={result.verdict}
    >
      <p className="flex items-center gap-2 text-lg font-extrabold text-foreground">
        {result.verdict === 'wrong' ? (
          <X className="h-5 w-5 text-accent" />
        ) : (
          <Check className="h-5 w-5 text-success" />
        )}
        {/* Correct French the card never listed — the judge found it, so it gets its own, happier line. */}
        {result.verdict === 'variant' && result.card && !result.variant
          ? t('verdict.alternative')
          : t(`verdict.${result.verdict}`)}
      </p>

      {result.card && <Scorecard card={result.card} />}

      {result.verdict === 'variant' && result.variant && (
        <p className="mt-2 text-base leading-8 text-muted-foreground">
          {t('verdictVariantDetail', { register: label('registers', result.variant.register) })}
        </p>
      )}

      {/* A drill cannot know every correct sentence, only the one it asked for. The copy claims only what is true. */}
      {result.verdict === 'wrong' && (
        <p className="mt-2 text-base leading-8 text-muted-foreground">{t('verdictWrongDetail')}</p>
      )}

      <p
        dir="ltr"
        className="mt-3 rounded-md border border-border bg-card p-3 text-2xl font-bold text-foreground"
      >
        <SentenceText text={sentence.text} lang={lang} />
      </p>
      {sentence.ipa && (
        <p dir="ltr" className="mt-1 font-mono text-base text-caption">
          {sentence.ipa}
        </p>
      )}

      {result.diff.length > 0 && result.verdict !== 'exact' && (
        <div dir="ltr" className="mt-3 flex flex-wrap gap-1.5 text-lg" data-testid="diff">
          {result.diff.map((part, i) => (
            <span
              key={i}
              className={
                part.kind === 'same'
                  ? 'text-caption'
                  : part.kind === 'missing'
                    ? 'rounded-md bg-success/20 px-1.5 py-0.5 font-semibold text-foreground'
                    : 'rounded-md bg-accent/20 px-1.5 py-0.5 text-accent line-through'
              }
            >
              {part.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
