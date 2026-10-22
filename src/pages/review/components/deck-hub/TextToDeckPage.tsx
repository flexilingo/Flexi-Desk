import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { useDeckHubStore } from '../../stores/deckHubStore';
import { useReviewStore } from '../../stores/reviewStore';
import { LanguagePicker } from '../parts/LanguagePicker';
import { PageBack } from '../parts/PageBack';
import { AnalyzedItemsList } from './AnalyzedItemsList';
import { AiErrorOrSetup } from '@/components/ai/AiErrorOrSetup';
import { CreateDeckFromItemsDialog } from './CreateDeckFromItemsDialog';

export function TextToDeckPage() {
  const { t } = useTranslation('decks');
  const navigate = useNavigate();
  const {
    inputText,
    sourceLanguage,
    targetLanguage,
    analyzedItems,
    isAnalyzing,
    analysisError,
    selectedIndices,
    setInputText,
    setSourceLanguage,
    setTargetLanguage,
    analyzeText,
    toggleItem,
    selectAll,
    deselectAll,
    createDeckFromSelected,
  } = useDeckHubStore();
  const { fetchDecks } = useReviewStore();

  const [createOpen, setCreateOpen] = useState(false);

  const handleAnalyze = () => {
    if (inputText.trim()) void analyzeText(inputText.trim(), sourceLanguage, targetLanguage);
  };

  return (
    <div className="space-y-5">
      <PageBack to="/review/deck-hub" label={t('deckHub')} />
      <div>
        <h1 className="text-xl font-bold text-foreground">{t('hub.textTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('hub.textSubtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[10rem] flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t('hub.sourceLanguage')}
          </label>
          <LanguagePicker value={sourceLanguage} onSelect={setSourceLanguage} />
        </div>
        <div className="flex min-w-[10rem] flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t('hub.translationLanguage')}
          </label>
          <LanguagePicker value={targetLanguage} onSelect={setTargetLanguage} />
        </div>
      </div>

      <div className="space-y-2">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={t('hub.textPlaceholder')}
          rows={6}
          dir="auto"
          className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t('hub.chars', { count: inputText.length })}
          </span>
          <Button size="sm" onClick={handleAnalyze} disabled={isAnalyzing || !inputText.trim()}>
            {isAnalyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {isAnalyzing ? t('hub.analyzing') : t('hub.analyze')}
          </Button>
        </div>
      </div>

      <AiErrorOrSetup message={analysisError} onReady={handleAnalyze} />

      {analyzedItems.length > 0 && (
        <div className="space-y-4">
          <AnalyzedItemsList
            items={analyzedItems}
            selectedIndices={selectedIndices}
            onToggle={toggleItem}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
          />
          <Button disabled={selectedIndices.size === 0} onClick={() => setCreateOpen(true)}>
            {t('hub.createWith', { count: selectedIndices.size })}
          </Button>
        </div>
      )}

      <CreateDeckFromItemsDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        selectedCount={selectedIndices.size}
        defaultLanguage={sourceLanguage}
        nativeLanguage={targetLanguage}
        onCreate={createDeckFromSelected}
        onCreated={(deck) => {
          void fetchDecks();
          navigate(`/review/deck/${deck.id}`);
        }}
      />
    </div>
  );
}
