import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Zap, Sparkles, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';

interface Deck {
  id: string;
  name: string;
  card_count: number;
}

interface RawDeck {
  id: string;
  name: string;
  card_count: number;
}

interface WordResult {
  word: string;
  translation?: string;
  partOfSpeech?: string;
  definition?: string;
  ipa?: string;
  difficulty?: string;
  examples?: { source: string; target: string }[];
  synonyms?: string[];
  tip?: string;
}

type Mode = 'basic' | 'smart';

interface AddToDeckDialogProps {
  words: string[];
  episodeId: string;
  onClose: () => void;
  open: boolean;
  onSuccess?: () => void;
  sentenceContext?: string;
}

export function AddToDeckDialog({
  words,
  onClose,
  open,
  onSuccess,
  sentenceContext = '',
}: AddToDeckDialogProps) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [creatingDeckLoading, setCreatingDeckLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cardsAdded, setCardsAdded] = useState(0);
  const [mode, setMode] = useState<Mode>('basic');
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [progressText, setProgressText] = useState('');
  const { targetLang, nativeLang } = useLanguageSettings();

  // Fetch local decks when dialog opens
  useEffect(() => {
    if (!open) return;
    setIsLoadingDecks(true);
    invoke<RawDeck[]>('srs_list_decks')
      .then((raw) => {
        const list = raw.map((d) => ({ id: d.id, name: d.name, card_count: d.card_count }));
        setDecks(list);
        if (list.length > 0) {
          setSelectedDeckId(list[0].id);
        }
      })
      .catch(() => setDecks([]))
      .finally(() => setIsLoadingDecks(false));
  }, [open]);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setSelectedDeckId(null);
      setNewDeckName('');
      setIsCreatingDeck(false);
      setError(null);
      setSuccess(false);
      setProcessing(false);
      setCardsAdded(0);
      setAiWarning(null);
      setProgressText('');
    }
  }, [open]);

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) {
      setError('Deck name required');
      return;
    }
    setCreatingDeckLoading(true);
    setError(null);
    try {
      const newDeck = await invoke<RawDeck>('srs_create_deck', {
        name: newDeckName.trim(),
        language: targetLang,
        algorithm: 'fsrs',
        description: undefined,
      });
      setDecks((prev) => [{ id: newDeck.id, name: newDeck.name, card_count: 0 }, ...prev]);
      setSelectedDeckId(newDeck.id);
      setNewDeckName('');
      setIsCreatingDeck(false);
    } catch {
      setError('Failed to create deck');
    } finally {
      setCreatingDeckLoading(false);
    }
  };

  const handleAddToDeck = useCallback(async () => {
    if (!selectedDeckId || words.length === 0) {
      setError('Select a deck first');
      return;
    }
    setProcessing(true);
    setError(null);
    setAiWarning(null);

    let enriched: WordResult[] = [];
    let aiUsed = false;

    // Attempt AI enrichment
    try {
      setProgressText('Analyzing with AI...');
      const results = await invoke<WordResult[]>('ai_translate_words', {
        words,
        mode,
        nativeLang,
        targetLang,
        sentenceContext,
      });
      enriched = results;
      aiUsed = true;
    } catch (err) {
      // AI unavailable — fall back to plain word insertion
      const errMsg = String(err);
      setAiWarning(`AI error: ${errMsg}. Cards added without translation.`);
      enriched = words.map((w) => ({ word: w }));
    }

    setProgressText('Saving cards...');

    let added = 0;
    try {
      for (const result of enriched) {
        const word = result.word || words[enriched.indexOf(result)] || '';
        if (!word) continue;

        // Build notes JSON for extra fields (smart mode)
        let notes: string | undefined;
        if (aiUsed && mode === 'smart') {
          const extras: Record<string, unknown> = { generated_by: 'smart_ai' };
          if (result.ipa) extras.ipa = result.ipa;
          if (result.examples?.length) extras.examples = result.examples;
          if (result.synonyms?.length) extras.synonyms = result.synonyms;
          if (result.tip) extras.tip = result.tip;
          notes = JSON.stringify(extras);
        } else if (aiUsed) {
          notes = JSON.stringify({ generated_by: 'basic_ai' });
        }

        try {
          await invoke('srs_add_card', {
            deckId: selectedDeckId,
            word,
            language: targetLang,
            translation: result.translation ?? undefined,
            definition: result.definition ?? undefined,
            pos: result.partOfSpeech ?? undefined,
            cefrLevel: result.difficulty ?? undefined,
            exampleSentence: result.examples?.[0]?.source ?? undefined,
            notes,
          });
          added++;
        } catch {
          // skip duplicates or errors silently
        }
      }

      setCardsAdded(added);
      setSuccess(true);
      onSuccess?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setProcessing(false);
      setProgressText('');
    }
  }, [selectedDeckId, words, targetLang, nativeLang, mode, sentenceContext, onSuccess]);

  if (!open) return null;

  // ── Success state ──
  if (success) {
    const selectedDeck = decks.find((d) => d.id === selectedDeckId);
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <div className="py-6 px-4 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <div className="text-lg font-bold text-[#8BB7A3] mb-1">
              {cardsAdded} card{cardsAdded !== 1 ? 's' : ''} saved!
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              Added to {selectedDeck?.name ?? 'deck'}
            </div>
            {aiWarning ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/30 text-left mb-4">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">{aiWarning}</p>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mb-4">
                Enriched with AI · {mode === 'smart' ? 'Smart mode' : 'Basic mode'}
              </div>
            )}
            <Button variant="outline" onClick={onClose} className="text-sm">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Main form ──
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !processing && onClose()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onPointerDownOutside={(e) => processing && e.preventDefault()}
        onEscapeKeyDown={(e) => processing && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add to Deck</DialogTitle>
          <DialogDescription>
            {words.length} word{words.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error */}
          {error && (
            <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-2 text-destructive/70 hover:text-destructive"
              >
                &times;
              </button>
            </div>
          )}

          {/* AI Mode selector */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              AI Enrichment
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('basic')}
                disabled={processing}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-all text-left',
                  mode === 'basic'
                    ? 'border-[#8BB7A3] bg-[#8BB7A3]/10'
                    : 'border-border hover:border-[#8BB7A3]/50',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-[#8BB7A3]" />
                  <span className="text-xs font-semibold">Basic</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Translation + part of speech
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMode('smart')}
                disabled={processing}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-all text-left',
                  mode === 'smart'
                    ? 'border-[#C58C6E] bg-[#C58C6E]/10'
                    : 'border-border hover:border-[#C58C6E]/50',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#C58C6E]" />
                  <span className="text-xs font-semibold">Smart</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Full enrichment: IPA, examples, tips
                </span>
              </button>
            </div>
          </div>

          {/* Deck Selection */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Deck
            </span>

            {/* Create New Deck */}
            {!isCreatingDeck ? (
              <button
                type="button"
                className="w-full p-3 rounded-xl border-2 border-dashed border-border bg-transparent text-muted-foreground text-xs cursor-pointer flex items-center justify-center gap-2 hover:border-[#8BB7A3] hover:text-foreground transition-all"
                onClick={() => setIsCreatingDeck(true)}
                disabled={processing}
              >
                <span>➕</span>
                <span>Create New Deck</span>
              </button>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="Deck name..."
                  className="text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateDeck();
                    if (e.key === 'Escape') setIsCreatingDeck(false);
                  }}
                  autoFocus
                />
                <Button
                  onClick={handleCreateDeck}
                  disabled={!newDeckName.trim() || creatingDeckLoading}
                  size="sm"
                >
                  {creatingDeckLoading ? '...' : 'Create'}
                </Button>
              </div>
            )}

            {/* Deck List */}
            {isLoadingDecks ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Loading decks...</p>
            ) : decks.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No decks yet. Create one above.
              </p>
            ) : (
              <div className="max-h-[160px] overflow-y-auto space-y-1.5">
                {decks.map((deck) => (
                  <button
                    key={deck.id}
                    type="button"
                    className={`w-full flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedDeckId === deck.id
                        ? 'border-[#8BB7A3] bg-[#8BB7A3]/10'
                        : 'border-border bg-muted/30 hover:border-[#8BB7A3]/50'
                    }`}
                    onClick={() => setSelectedDeckId(deck.id)}
                  >
                    <div className="flex flex-col items-start gap-0.5 min-w-0">
                      <span className="text-xs font-semibold truncate max-w-full">{deck.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {deck.card_count ?? 0} cards
                      </span>
                    </div>
                    {selectedDeckId === deck.id && (
                      <span className="text-sm text-[#8BB7A3] font-bold shrink-0 ml-2">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={processing} className="text-xs">
            Cancel
          </Button>
          <Button
            onClick={handleAddToDeck}
            disabled={!selectedDeckId || words.length === 0 || processing}
            className="text-xs"
          >
            {processing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                {progressText || 'Processing...'}
              </>
            ) : (
              `Add ${words.length} Word${words.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
