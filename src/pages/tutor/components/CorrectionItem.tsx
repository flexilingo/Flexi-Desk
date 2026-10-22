import { X, Check, Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GrammarCorrection, CorrectionType } from '../types';

const borderColorByType: Record<CorrectionType, string> = {
  grammar: 'border-l-primary',
  spelling: 'border-l-warning',
  word_choice: 'border-l-success',
  word_order: 'border-l-muted',
};

export function CorrectionItem({
  correction,
  className = 'bg-muted/30',
}: {
  correction: GrammarCorrection;
  className?: string;
}) {
  const { t } = useTranslation('tutor');
  return (
    <div
      className={`border-l-4 ${borderColorByType[correction.type]} rounded p-3 space-y-1 ${className}`}
    >
      <p className="flex items-start gap-2 text-sm text-muted-foreground line-through">
        <X
          className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
          aria-label={t('corrections.wrong')}
        />
        <span>{correction.original}</span>
      </p>
      <p className="flex items-start gap-2 text-sm font-medium text-foreground">
        <Check
          className="mt-0.5 h-4 w-4 shrink-0 text-success"
          aria-label={t('corrections.right')}
        />
        <span>{correction.corrected}</span>
      </p>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Lightbulb
          className="mt-0.5 h-4 w-4 shrink-0 text-warning"
          aria-label={t('corrections.why')}
        />
        <span>{correction.explanation}</span>
      </p>
    </div>
  );
}
