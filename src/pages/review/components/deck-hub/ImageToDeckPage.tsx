import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image, Upload, Loader2, Sparkles } from 'lucide-react';
import { AiErrorOrSetup } from '@/components/ai/AiErrorOrSetup';
import { useTranslation } from 'react-i18next';
import { open as openFile } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { LanguagePicker } from '../parts/LanguagePicker';
import { PageBack } from '../parts/PageBack';
import { useDeckHubStore } from '../../stores/deckHubStore';
import { useReviewStore } from '../../stores/reviewStore';
import { AnalyzedItemsList } from './AnalyzedItemsList';
import { CreateDeckFromItemsDialog } from './CreateDeckFromItemsDialog';

export function ImageToDeckPage() {
  const navigate = useNavigate();
  const {
    inputText,
    sourceLanguage,
    targetLanguage,
    ocrText,
    ocrConfidence,
    isOcrProcessing,
    ocrLoadingLanguage,
    analyzedItems,
    isAnalyzing,
    analysisError,
    selectedIndices,
    setInputText,
    setSourceLanguage,
    setTargetLanguage,
    ocrImage,
    analyzeText,
    toggleItem,
    selectAll,
    deselectAll,
    createDeckFromSelected,
  } = useDeckHubStore();
  const { fetchDecks } = useReviewStore();
  const { t } = useTranslation('decks');
  const { t: tOcr } = useTranslation('deckHubOcr');

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);

  const handlePickImage = async () => {
    const path = await openFile({
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'] }],
    });
    if (!path || Array.isArray(path)) return;
    setSelectedImagePath(path);
    await ocrImage(path, sourceLanguage);
  };

  const handleAnalyze = () => {
    const text = inputText || ocrText;
    if (text.trim()) {
      analyzeText(text.trim(), sourceLanguage, targetLanguage);
    }
  };

  return (
    <div className="space-y-5">
      <PageBack to="/review/deck-hub" label={t('deckHub')} />
      <div>
        <h1 className="text-xl font-bold text-foreground">{t('hub.imageTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('hub.imageSubtitle')}</p>
      </div>

      {/* Image picker */}
      <div
        onClick={handlePickImage}
        className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
      >
        {isOcrProcessing ? (
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
        ) : selectedImagePath ? (
          <Image className="w-8 h-8 text-success" />
        ) : (
          <Upload className="w-8 h-8 text-muted-foreground" />
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isOcrProcessing
              ? ocrLoadingLanguage
                ? tOcr('loadingLanguage')
                : t('hub.extracting')
              : selectedImagePath
                ? t('hub.changeImage')
                : t('hub.pickImage')}
          </p>
          {!isOcrProcessing && (
            <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WEBP, BMP, TIFF</p>
          )}
        </div>
        {ocrConfidence > 0 && !isOcrProcessing && (
          <span className="text-xs text-success">
            {t('hub.ocrConfidence', { pct: Math.round(ocrConfidence * 100) })}
          </span>
        )}
      </div>

      {/* Editable OCR result + language selectors */}
      {(ocrText || inputText) && !isOcrProcessing && (
        <div className="space-y-3">
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

          <textarea
            value={inputText || ocrText}
            onChange={(e) => setInputText(e.target.value)}
            rows={5}
            placeholder={t('hub.ocrPlaceholder')}
            dir="auto"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleAnalyze}
              disabled={isAnalyzing || !(inputText || ocrText).trim()}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('hub.analyzing')}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('hub.analyze')}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

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
          fetchDecks();
          navigate(`/review/deck/${deck.id}`);
        }}
      />
    </div>
  );
}
