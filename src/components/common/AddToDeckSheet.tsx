import { useState, useEffect } from 'react';
import { X, Plus, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invoke } from '@tauri-apps/api/core';
import { useReviewStore } from '@/pages/review/stores/reviewStore';

export interface AddToDeckItem {
  word: string;
  language: string;
  translation?: string;
  definition?: string;
  pos?: string;
  cefrLevel?: string;
  exampleSentence?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: AddToDeckItem[];
  defaultLanguage?: string;
}

export function AddToDeckSheet({ open, onOpenChange, items, defaultLanguage }: Props) {
  const { decks, fetchDecks } = useReviewStore();

  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [showNewDeck, setShowNewDeck] = useState(false);

  useEffect(() => {
    if (open) {
      fetchDecks();
      setAddedCount(0);
      setError(null);
    }
  }, [open, fetchDecks]);

  useEffect(() => {
    if (decks.length > 0 && !selectedDeckId) {
      setSelectedDeckId(decks[0].id);
    }
  }, [decks, selectedDeckId]);

  if (!open) return null;

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return;
    setIsCreatingDeck(true);
    try {
      await invoke('srs_create_deck', {
        name: newDeckName.trim(),
        language: defaultLanguage ?? items[0]?.language ?? 'en',
        algorithm: 'fsrs',
        description: null,
      });
      await fetchDecks();
      setShowNewDeck(false);
      setNewDeckName('');
    } catch (e) {
      setError(String(e));
    } finally {
      setIsCreatingDeck(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedDeckId) return;
    setIsAdding(true);
    setError(null);

    const deck = decks.find((d) => d.id === selectedDeckId);
    if (!deck) { setError('Deck not found'); setIsAdding(false); return; }

    let count = 0;
    for (const item of items) {
      try {
        await invoke('srs_add_card', {
          deckId: selectedDeckId,
          word: item.word,
          language: item.language || deck.language,
          translation: item.translation ?? null,
          definition: item.definition ?? null,
          pos: item.pos ?? null,
          cefrLevel: item.cefrLevel ?? null,
          exampleSentence: item.exampleSentence ?? null,
          notes: null,
        });
        count++;
      } catch {
        // skip duplicates silently
      }
    }

    setAddedCount(count);
    setIsAdding(false);
  };

  const done = addedCount > 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
      onClick={() => !isAdding && onOpenChange(false)}
    >
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-xl p-5 w-full max-w-sm space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">
            Add to Deck
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {items.length} word{items.length !== 1 ? 's' : ''}
            </span>
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Words preview */}
        {items.length <= 3 ? (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item, i) => (
              <span key={i} className="text-sm bg-muted px-2 py-0.5 rounded-full">{item.word}</span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {items.slice(0, 3).map((i) => i.word).join(', ')} +{items.length - 3} more
          </p>
        )}

        {done ? (
          <div className="flex items-center gap-2 text-sm text-[#8BB7A3] bg-[#8BB7A3]/10 rounded-md px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Added {addedCount} card{addedCount !== 1 ? 's' : ''} to deck
          </div>
        ) : (
          <>
            {/* Deck selector */}
            {decks.length > 0 && !showNewDeck ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Choose deck</label>
                <select
                  value={selectedDeckId}
                  onChange={(e) => setSelectedDeckId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewDeck(true)}
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> New deck
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New deck name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="e.g. Vocabulary"
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleCreateDeck} disabled={isCreatingDeck || !newDeckName.trim()}>
                    {isCreatingDeck ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                  </Button>
                </div>
                {decks.length > 0 && (
                  <button onClick={() => setShowNewDeck(false)} className="text-xs text-muted-foreground hover:underline">
                    ← Pick existing deck
                  </button>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
            )}

            <Button
              className="w-full"
              onClick={handleAdd}
              disabled={isAdding || !selectedDeckId}
            >
              {isAdding
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Adding...</>
                : `Add to "${decks.find((d) => d.id === selectedDeckId)?.name ?? 'deck'}"`
              }
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
