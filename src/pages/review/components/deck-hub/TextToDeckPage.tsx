import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeckHubStore } from '../../stores/deckHubStore';
import { useReviewStore } from '../../stores/reviewStore';
import { AnalyzedItemsList } from './AnalyzedItemsList';
import { CreateDeckFromItemsDialog } from './CreateDeckFromItemsDialog';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fa', label: 'Persian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'tr', label: 'Turkish' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ru', label: 'Russian' },
  { code: 'hi', label: 'Hindi' },
];

export function TextToDeckPage() {
  const navigate = useNavigate();
  const {
    inputText, sourceLanguage, targetLanguage,
    analyzedItems, isAnalyzing, analysisError, selectedIndices,
    setInputText, setSourceLanguage, setTargetLanguage,
    analyzeText, toggleItem, selectAll, deselectAll, createDeckFromSelected,
  } = useDeckHubStore();
  const { fetchDecks } = useReviewStore();

  const [createOpen, setCreateOpen] = useState(false);

  const handleAnalyze = () => {
    if (inputText.trim()) {
      analyzeText(inputText.trim(), sourceLanguage, targetLanguage);
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
          <h1 className="text-xl font-bold text-foreground">Text → Deck</h1>
          <p className="text-sm text-muted-foreground">Paste any text — AI extracts vocabulary &amp; phrases</p>
        </div>
      </div>

      {/* Language selectors */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Source language</label>
          <select
            value={sourceLanguage}
            onChange={(e) => setSourceLanguage(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[130px]"
          >
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Translation language</label>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[130px]"
          >
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </div>

      {/* Text area */}
      <div className="space-y-2">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste any text here — article, lyrics, conversation, lecture notes..."
          rows={6}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{inputText.length} chars</span>
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={isAnalyzing || !inputText.trim()}
          >
            {isAnalyzing
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Analyzing...</>
              : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Analyze</>
            }
          </Button>
        </div>
      </div>

      {/* Error */}
      {analysisError && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{analysisError}</p>
      )}

      {/* Results */}
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
