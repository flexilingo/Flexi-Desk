import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Image, Upload, Loader2, Sparkles, AlertCircle, Terminal } from 'lucide-react';
import { open as openFile } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { invoke } from '@tauri-apps/api/core';
import { useDeckHubStore } from '../../stores/deckHubStore';
import { useReviewStore } from '../../stores/reviewStore';
import { AnalyzedItemsList } from './AnalyzedItemsList';
import { CreateDeckFromItemsDialog } from './CreateDeckFromItemsDialog';

export function ImageToDeckPage() {
  const navigate = useNavigate();
  const {
    inputText, sourceLanguage, targetLanguage,
    ocrText, ocrConfidence, isOcrProcessing,
    tesseractInstalled, analyzedItems, isAnalyzing, analysisError, selectedIndices,
    setInputText, setSourceLanguage, setTargetLanguage,
    checkTesseract, installTesseract, ocrImage,
    analyzeText, toggleItem, selectAll, deselectAll, createDeckFromSelected,
  } = useDeckHubStore();
  const { fetchDecks } = useReviewStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
  const checkedRef = useRef(false);

  // Check Tesseract on first render
  if (!checkedRef.current) {
    checkedRef.current = true;
    checkTesseract();
  }

  const handlePickImage = async () => {
    const path = await openFile({
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'] }],
    });
    if (!path || Array.isArray(path)) return;
    setSelectedImagePath(path);
    await ocrImage(path, sourceLanguage);
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const msg = await installTesseract();
      setInstallMsg(msg);
    } catch (e) {
      setInstallMsg(String(e));
    } finally {
      setIsInstalling(false);
    }
  };

  const getTesseractInstructions = async () => {
    const msg = await invoke<string>('deck_hub_tesseract_install_instructions');
    setInstallMsg(msg);
  };

  const handleAnalyze = () => {
    const text = inputText || ocrText;
    if (text.trim()) {
      analyzeText(text.trim(), sourceLanguage, targetLanguage);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/review/deck-hub')}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Image → Deck</h1>
          <p className="text-sm text-muted-foreground">Extract text from an image, then analyze with AI</p>
        </div>
      </div>

      {/* Tesseract check */}
      {tesseractInstalled === false && (
        <div className="border border-[#C58C6E]/30 bg-[#C58C6E]/5 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#C58C6E] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Tesseract OCR not found</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tesseract is required for image text extraction.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={handleInstall} disabled={isInstalling}>
              {isInstalling && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Install via Homebrew
            </Button>
            <Button size="sm" variant="outline" onClick={getTesseractInstructions}>
              <Terminal className="w-3.5 h-3.5 mr-1.5" />
              Show instructions
            </Button>
          </div>
          {installMsg && (
            <pre className="text-xs bg-muted rounded p-2 whitespace-pre-wrap overflow-auto max-h-32">{installMsg}</pre>
          )}
        </div>
      )}

      {/* Image picker */}
      {tesseractInstalled !== false && (
        <div
          onClick={handlePickImage}
          className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
        >
          {isOcrProcessing ? (
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
          ) : selectedImagePath ? (
            <Image className="w-8 h-8 text-[#8BB7A3]" />
          ) : (
            <Upload className="w-8 h-8 text-muted-foreground" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {isOcrProcessing ? 'Extracting text...' : selectedImagePath ? 'Click to change image' : 'Click to pick an image'}
            </p>
            {!isOcrProcessing && (
              <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WEBP, BMP, TIFF</p>
            )}
          </div>
          {ocrConfidence > 0 && !isOcrProcessing && (
            <span className="text-xs text-[#8BB7A3]">OCR confidence: {Math.round(ocrConfidence * 100)}%</span>
          )}
        </div>
      )}

      {/* Editable OCR result + language selectors */}
      {(ocrText || inputText) && !isOcrProcessing && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Source language</label>
              <select
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[130px]"
              >
                {[['en','English'],['fa','Persian'],['ar','Arabic'],['tr','Turkish'],['de','German'],['fr','French'],['es','Spanish'],['zh','Chinese']].map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Translation language</label>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[130px]"
              >
                {[['en','English'],['fa','Persian'],['ar','Arabic'],['tr','Turkish'],['de','German'],['fr','French'],['es','Spanish'],['zh','Chinese']].map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <textarea
            value={inputText || ocrText}
            onChange={(e) => setInputText(e.target.value)}
            rows={5}
            placeholder="OCR result will appear here — you can edit it before analyzing"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleAnalyze}
              disabled={isAnalyzing || !(inputText || ocrText).trim()}
            >
              {isAnalyzing
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Analyzing...</>
                : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Analyze</>
              }
            </Button>
          </div>
        </div>
      )}

      {analysisError && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{analysisError}</p>
      )}

      {analyzedItems.length > 0 && (
        <div className="space-y-4">
          <AnalyzedItemsList
            items={analyzedItems}
            selectedIndices={selectedIndices}
            onToggle={toggleItem}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
          />
          <Button
            className="w-full"
            disabled={selectedIndices.size === 0}
            onClick={() => setCreateOpen(true)}
          >
            Create Deck with {selectedIndices.size} cards
          </Button>
        </div>
      )}

      <CreateDeckFromItemsDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        selectedCount={selectedIndices.size}
        defaultLanguage={sourceLanguage}
        onCreate={createDeckFromSelected}
        onCreated={(deck) => {
          fetchDecks();
          navigate(`/review/deck/${deck.id}`);
        }}
      />
    </div>
  );
}
