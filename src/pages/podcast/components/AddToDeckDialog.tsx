import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
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
import { supabaseCall } from '../../../lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';

type AddMode = 'basic' | 'smart';

interface Deck {
  id: string;
  title: string;
  card_count: number;
}

interface AddToDeckDialogProps {
  words: string[];
  episodeId: string;
  onClose: () => void;
  open: boolean;
  onSuccess?: () => void;
}

export function AddToDeckDialog({
  words,
  episodeId,
  onClose,
  open,
  onSuccess,
}: AddToDeckDialogProps) {
  const session = useAuthStore((s) => s.session);

  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [creatingDeckLoading, setCreatingDeckLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<AddMode>('basic');
  const [processing, setProcessing] = useState(false);
  const [cardsQueued, setCardsQueued] = useState(0);
  const { nativeLang: targetLang } = useLanguageSettings();

  // Fetch decks when dialog opens
  useEffect(() => {
    if (!open || !session) return;
    setIsLoadingDecks(true);
    supabaseCall<{ decks: Deck[] } | Deck[]>('GET', '/decks?action=list')
      .then((data) => {
        const deckList = Array.isArray(data) ? data : (data.decks ?? []);
        setDecks(deckList);
        if (deckList.length > 0 && !selectedDeckId) {
          setSelectedDeckId(deckList[0].id);
        }
      })
      .catch(() => setDecks([]))
      .finally(() => setIsLoadingDecks(false));
  }, [open, session]);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setSelectedDeckId(null);
      setNewDeckName('');
      setIsCreatingDeck(false);
      setError(null);
      setSuccess(false);
      setProcessing(false);
      setCardsQueued(0);
      setMode('basic');
    }
  }, [open]);

  // Create new deck
  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) {
      setError('Deck name required');
      return;
    }
    setCreatingDeckLoading(true);
    setError(null);
    try {
      const newDeck = await supabaseCall<Deck>('POST', '/decks?action=create', {
        title: newDeckName.trim(),
        description: '',
        is_public: false,
        tags: [],
        language_pair: 'en-fa',
      });
      setDecks((prev) => [newDeck, ...prev]);
      setSelectedDeckId(newDeck.id);
      setNewDeckName('');
      setIsCreatingDeck(false);
    } catch {
      setError('Failed to create deck');
    } finally {
      setCreatingDeckLoading(false);
    }
  };

  // Add words to deck
  const handleAddToDeck = useCallback(async () => {
    if (!selectedDeckId || words.length === 0) {
      setError('Select a deck first');
      return;
    }
    setProcessing(true);
    setError(null);

    try {
      const result = await supabaseCall<{ cards_added: number }>(
        'POST',
        '/smart-add-to-deck?action=create-task-v3',
        {
          deck_id: selectedDeckId,
          words,
          mode,
          target_language: targetLang,
          video_id: episodeId,
        },
      );
      setCardsQueued(result.cards_added ?? words.length);
      setSuccess(true);
      onSuccess?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setProcessing(false);
    }
  }, [selectedDeckId, words, mode, targetLang, episodeId, onSuccess]);

  const isLoading = creatingDeckLoading || processing;

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
              {cardsQueued} card{cardsQueued !== 1 ? 's' : ''} saved!
            </div>
            <div className="text-xs text-muted-foreground mb-5">
              Added to {selectedDeck?.title ?? 'deck'}
            </div>

            {mode === 'smart' ? (
              <div className="bg-muted/40 border border-border rounded-xl p-4 mb-5 mx-auto max-w-[420px] text-left">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full bg-[#8BB7A3]/20 border border-[#8BB7A3] flex items-center justify-center shrink-0">
                    <span className="text-[#8BB7A3] text-xs font-bold">✓</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Cards saved to deck</div>
                    <div className="text-xs text-muted-foreground">
                      {cardsQueued} words added instantly
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                    <div className="w-3 h-3 border-2 border-[#8BB7A3]/40 border-t-[#8BB7A3] rounded-full animate-spin" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">AI processing</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      Translations, examples, and context will be added shortly
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-muted/40 border border-border rounded-xl p-4 mb-5 mx-auto max-w-[420px] text-left">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#8BB7A3]/20 border border-[#8BB7A3] flex items-center justify-center shrink-0">
                    <span className="text-[#8BB7A3] text-xs font-bold">✓</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Cards saved to deck</div>
                    <div className="text-xs text-muted-foreground">
                      {cardsQueued} cards added successfully
                    </div>
                  </div>
                </div>
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
    <Dialog open={open} onOpenChange={(o) => !o && !isLoading && onClose()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onPointerDownOutside={(e) => isLoading && e.preventDefault()}
        onEscapeKeyDown={(e) => isLoading && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add to Deck</DialogTitle>
          <DialogDescription>
            {words.length} word{words.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Auth check */}
          {!session && (
            <div className="flex items-start gap-3 rounded-xl border border-[#C58C6E]/40 bg-[#C58C6E]/10 px-4 py-3">
              <span className="text-xl">🔐</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Sign in to save cards</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Go to Settings to sign in with Google or Apple
                </p>
              </div>
            </div>
          )}

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

          {/* Mode Selection */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Card Mode
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('basic')}
                className={`rounded-xl border-2 p-3 text-left transition-all ${
                  mode === 'basic'
                    ? 'border-[#8BB7A3] bg-[#8BB7A3]/10'
                    : 'border-border bg-muted/30 hover:border-muted-foreground/30'
                }`}
                disabled={isLoading}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-base">📝</span>
                  <span className="text-xs font-semibold">Basic</span>
                  <span className="ml-auto rounded bg-[#8BB7A3]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#8BB7A3]">
                    Free
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Simple word-translation cards
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('smart')}
                className={`rounded-xl border-2 p-3 text-left transition-all ${
                  mode === 'smart'
                    ? 'border-[#8BB7A3] bg-[#8BB7A3]/10'
                    : 'border-border bg-muted/30 hover:border-muted-foreground/30'
                }`}
                disabled={isLoading}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-base">🧠</span>
                  <span className="text-xs font-semibold">Smart</span>
                  <span className="ml-auto rounded bg-[#C58C6E]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#C58C6E]">
                    Pro
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  AI-powered with context, examples
                </p>
              </button>
            </div>
          </div>

          {/* Target Language */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30 border border-border rounded-lg">
            <span className="text-xs text-muted-foreground">Translating to:</span>
            <span className="text-xs font-semibold">Persian</span>
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
                      <span className="text-xs font-semibold truncate max-w-full">
                        {deck.title}
                      </span>
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
          <Button variant="outline" onClick={onClose} disabled={isLoading} className="text-xs">
            Cancel
          </Button>
          {!session ? (
            <Button disabled className="text-xs">
              Sign in to save
            </Button>
          ) : (
            <Button
              onClick={handleAddToDeck}
              disabled={!selectedDeckId || words.length === 0 || isLoading}
              className="text-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Adding...
                </>
              ) : (
                `Add ${words.length} Word${words.length !== 1 ? 's' : ''}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
