import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Loader2,
  Volume2,
  ChevronDown,
  ChevronUp,
  Check,
  Library,
  BookOpen,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import type { RawTranslationResult, TranslationResult } from '@/pages/podcast/types';
import { mapTranslationResult } from '@/pages/podcast/types';
import type { WordDialogTab } from '@/pages/podcast/components/WordDialog/types';
import { GoogleTab } from '@/pages/podcast/components/WordDialog/GoogleTab';
import { AITab } from '@/pages/podcast/components/WordDialog/AITab';
import { DictionaryTab } from '@/pages/podcast/components/WordDialog/DictionaryTab';
import { MerriamWebsterTab } from '@/pages/podcast/components/WordDialog/MerriamWebsterTab';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';

const CEFR_COLORS: Record<string, string> = {
  A1: 'bg-[#8BB7A3]/20 text-[#8BB7A3] border-[#8BB7A3]/40',
  A2: 'bg-[#8BB7A3]/15 text-[#8BB7A3] border-[#8BB7A3]/30',
  B1: 'bg-[#C58C6E]/20 text-[#C58C6E] border-[#C58C6E]/40',
  B2: 'bg-[#C58C6E]/15 text-[#C58C6E] border-[#C58C6E]/30',
  C1: 'bg-red-500/20 text-red-400 border-red-500/40',
  C2: 'bg-red-500/15 text-red-400 border-red-500/30',
};

function getCefrBadgeClass(level: string): string {
  return CEFR_COLORS[level] || 'bg-muted text-muted-foreground border-border';
}

const TABS: { id: WordDialogTab; label: string; icon: string }[] = [
  { id: 'google', label: 'Google', icon: '🌐' },
  { id: 'ai', label: 'AI', icon: '🤖' },
  { id: 'dictionary', label: 'Dictionary', icon: '📖' },
  { id: 'merriam-webster', label: 'M-W', icon: '📚' },
];

interface DeckInfo {
  id: string;
  name: string;
  language: string;
  card_count: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  word: string | null;
  sentenceContext?: string;
  sourceLang?: string;
}

export function DictionarySheet({
  open,
  onOpenChange,
  word,
  sentenceContext = '',
  sourceLang = 'en',
}: Props) {
  const { nativeLang } = useLanguageSettings();
  const targetLang = nativeLang;

  const [activeTab, setActiveTab] = useState<WordDialogTab>('google');
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick add
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);

  // Deck selector
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [decks, setDecks] = useState<DeckInfo[]>([]);
  const [addingToDeck, setAddingToDeck] = useState<string | null>(null);
  const [addedToDecks, setAddedToDecks] = useState<Set<string>>(new Set());

  // Reset state when dialog opens with new word
  useEffect(() => {
    if (!open || !word) return;
    setActiveTab('google');
    setTranslation(null);
    setError(null);
    setAdded(false);
    setShowDeckPicker(false);
    setAddedToDecks(new Set());
    setIsLoading(true);

    invoke<RawTranslationResult>('podcast_translate_word', {
      word: word.toLowerCase().trim(),
      sourceLang,
      targetLang,
    })
      .then((raw) => {
        setTranslation(mapTranslationResult(raw));
        setIsLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setIsLoading(false);
      });
  }, [open, word, sourceLang, targetLang]);

  // Load decks when deck picker opens
  useEffect(() => {
    if (!showDeckPicker || decks.length > 0) return;
    invoke<DeckInfo[]>('srs_list_decks')
      .then(setDecks)
      .catch(() => {});
  }, [showDeckPicker, decks.length]);

  const speak = useCallback(
    (accent: 'en-US' | 'en-GB') => {
      const utterance = new SpeechSynthesisUtterance(word ?? '');
      utterance.lang = accent;
      utterance.rate = 0.85;
      speechSynthesis.speak(utterance);
    },
    [word],
  );

  const handleAddToSrs = async () => {
    if (!word) return;
    setIsAdding(true);
    try {
      await invoke('srs_add_vocabulary', {
        word: word.toLowerCase(),
        language: sourceLang,
        sourceModule: 'review',
        translation: translation?.translation || null,
        cefrLevel: translation?.cefrLevel || null,
      });
      setAdded(true);
    } catch {
      // silently fail
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddToDeck = async (deckId: string) => {
    if (!word) return;
    setAddingToDeck(deckId);
    try {
      await invoke('srs_add_card', {
        deckId,
        word: word.toLowerCase(),
        language: sourceLang,
        translation: translation?.translation || null,
        cefrLevel: translation?.cefrLevel || null,
      });
      setAddedToDecks((prev) => new Set(prev).add(deckId));
    } catch {
      // silently fail
    } finally {
      setAddingToDeck(null);
    }
  };

  if (!word) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <DialogTitle className="text-xl font-bold capitalize">{word}</DialogTitle>
            {translation && translation.cefrLevel && (
              <Badge
                variant="outline"
                className={`text-[10px] font-semibold border ${getCefrBadgeClass(translation.cefrLevel)}`}
              >
                {translation.cefrLevel}
              </Badge>
            )}
          </div>
          <DialogDescription className="sr-only">
            Translation and details for &ldquo;{word}&rdquo;
          </DialogDescription>

          {/* Pronunciation buttons */}
          <div className="flex items-center gap-1 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => speak('en-US')}
            >
              <Volume2 className="h-3.5 w-3.5" />
              US
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => speak('en-GB')}
            >
              <Volume2 className="h-3.5 w-3.5" />
              UK
            </Button>
          </div>
        </DialogHeader>

        {/* Tab Bar */}
        <div className="flex items-center border-y border-border bg-muted/30 px-2 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4">
            {activeTab === 'google' && (
              <GoogleTab translation={translation} isLoading={isLoading} error={error} />
            )}
            {activeTab === 'ai' && (
              <AITab
                word={word}
                sentenceContext={sentenceContext}
                sourceLang={sourceLang}
                targetLang={targetLang}
                isActive={activeTab === 'ai'}
              />
            )}
            {activeTab === 'dictionary' && (
              <DictionaryTab word={word} isActive={activeTab === 'dictionary'} />
            )}
            {activeTab === 'merriam-webster' && (
              <MerriamWebsterTab word={word} isActive={activeTab === 'merriam-webster'} />
            )}
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="p-3 space-y-2 shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs gap-1.5"
              onClick={handleAddToSrs}
              disabled={isAdding || added}
            >
              {isAdding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : added ? (
                <Check className="h-3.5 w-3.5 text-[#8BB7A3]" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {added ? 'Added' : 'Quick Add'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setShowDeckPicker(!showDeckPicker)}
            >
              <Library className="h-3.5 w-3.5" />
              Deck
              {showDeckPicker ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </div>

          {/* Deck picker */}
          {showDeckPicker && (
            <div className="rounded-lg border border-border bg-background/50 p-2 space-y-1 max-h-36 overflow-y-auto">
              {decks.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-2">
                  No decks found. Create one in the SRS section.
                </p>
              ) : (
                decks.map((deck) => {
                  const isAddedToDeck = addedToDecks.has(deck.id);
                  const isAddingThis = addingToDeck === deck.id;
                  return (
                    <button
                      key={deck.id}
                      className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 text-xs transition-colors"
                      onClick={() => handleAddToDeck(deck.id)}
                      disabled={isAddedToDeck || isAddingThis}
                    >
                      <span className="flex-1 text-left truncate font-medium">{deck.name}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {deck.card_count} cards
                      </span>
                      {isAddingThis ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isAddedToDeck ? (
                        <Check className="h-3 w-3 text-[#8BB7A3]" />
                      ) : (
                        <Plus className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
