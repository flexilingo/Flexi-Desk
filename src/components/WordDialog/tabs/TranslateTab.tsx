import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, FileText, Layers, RotateCw } from 'lucide-react';
import { directionOf } from '../languages';
import { splitTranslation } from '../logic';
import type { DeckCardData, WordDetails } from '../types';
import {
  ActionButton,
  AnswerCard,
  ErrorBox,
  ExampleList,
  LoadingBlock,
  LookupChip,
  Section,
} from '../ui';

interface Props {
  wordDetails: WordDetails | null;
  loading: boolean;
  /** Already translated message, or null. */
  error: string | null;
  targetLanguage: string | null;
  sourceLanguage: string;
  onDeckDataChange?: (data: DeckCardData | null) => void;
  /**
   * Switch to the AI tab. Offered HERE and only here: when the free chain comes up
   * empty there is nothing more the plain translation can say, so the offer is help.
   */
  onAskAI?: () => void;
  onRetry?: () => void;
}

function notesFor(d: WordDetails): string {
  const parts = ['Source: FlexiLingo Translate', '', `Translation: ${d.translation}`];
  if (d.alternativeTranslations?.length) {
    parts.push('', 'Alternative translations:');
    d.alternativeTranslations.forEach((alt, i) => parts.push(`   ${i + 1}. ${alt}`));
  }
  if (d.examples.length) {
    parts.push('', 'Examples:');
    d.examples.forEach((ex, i) => {
      parts.push(`   ${i + 1}. "${ex.source}"`);
      if (ex.target) parts.push(`      -> "${ex.target}"`);
    });
  }
  return parts.join('\n');
}

export function TranslateTab({
  wordDetails,
  loading,
  error,
  targetLanguage,
  sourceLanguage,
  onDeckDataChange,
  onAskAI,
  onRetry,
}: Props) {
  const { t } = useTranslation('wordDialog');
  const targetDir = targetLanguage ? directionOf(targetLanguage) : 'ltr';

  useEffect(() => {
    if (!onDeckDataChange) return;
    onDeckDataChange(
      wordDetails
        ? {
            word: wordDetails.word,
            back: wordDetails.translation,
            notes: notesFor(wordDetails),
            examples: wordDetails.examples,
            source: 'google',
          }
        : null,
    );
  }, [wordDetails, onDeckDataChange]);

  if (loading) return <LoadingBlock label={t('translating')} />;

  if (error) {
    return (
      <ErrorBox message={error}>
        {onRetry && (
          <ActionButton variant="quiet" onClick={onRetry}>
            <RotateCw className="h-4 w-4" />
            {t('retry')}
          </ActionButton>
        )}
        {onAskAI && (
          <ActionButton onClick={onAskAI}>
            <Bot className="h-4 w-4" />
            {t('askAI')}
          </ActionButton>
        )}
      </ErrorBox>
    );
  }

  if (!wordDetails) return null;

  const { main, note } = splitTranslation(wordDetails.translation);

  return (
    <div className="space-y-6">
      <AnswerCard
        label={t('translation')}
        icon={Layers}
        text={main}
        note={note}
        dir={targetDir}
        lang={targetLanguage}
      />

      {!!wordDetails.alternativeTranslations?.length && (
        <Section label={t('alternativeTranslations')}>
          <div className="flex flex-wrap gap-2">
            {wordDetails.alternativeTranslations.map((alt, index) => (
              <LookupChip key={index} text={alt} lang={targetLanguage} dir={targetDir} />
            ))}
          </div>
        </Section>
      )}

      {wordDetails.examples.length > 0 && (
        <Section label={t('examples')} icon={FileText} tone="success">
          <ExampleList
            examples={wordDetails.examples}
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
            targetDir={targetDir}
          />
        </Section>
      )}
    </div>
  );
}
