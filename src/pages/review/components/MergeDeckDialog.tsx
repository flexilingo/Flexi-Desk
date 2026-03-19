import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Merge } from 'lucide-react';
import type { DeckWithStats } from '../types';

interface MergeDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: DeckWithStats[];
  onMerged: () => void;
}

export function MergeDeckDialog({ open, onOpenChange, decks, onMerged }: MergeDeckDialogProps) {
  const [sourceDeckId, setSourceDeckId] = useState('');
  const [targetDeckId, setTargetDeckId] = useState('');
  const [deleteSource, setDeleteSource] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceDeck = decks.find((d) => d.id === sourceDeckId);
  const targetDeck = decks.find((d) => d.id === targetDeckId);
  const canMerge = sourceDeckId && targetDeckId && sourceDeckId !== targetDeckId;

  const handleMerge = async () => {
    if (!canMerge) return;
    setIsLoading(true);
    setError(null);
    try {
      await invoke('srs_merge_decks', {
        sourceDeckId,
        targetDeckId,
        deleteSource,
      });
      onMerged();
      onOpenChange(false);
      setSourceDeckId('');
      setTargetDeckId('');
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge Decks
          </DialogTitle>
          <DialogDescription>
            Move all cards from one deck into another. Duplicate cards (same word) will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Source deck (move cards from)</label>
            <select
              value={sourceDeckId}
              onChange={(e) => setSourceDeckId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select source deck</option>
              {decks
                .filter((d) => d.id !== targetDeckId)
                .map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({deck.cardCount} cards)
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Target deck (move cards to)</label>
            <select
              value={targetDeckId}
              onChange={(e) => setTargetDeckId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select target deck</option>
              {decks
                .filter((d) => d.id !== sourceDeckId)
                .map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({deck.cardCount} cards)
                  </option>
                ))}
            </select>
          </div>

          {sourceDeck && targetDeck && sourceDeck.algorithm !== targetDeck.algorithm && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Cards will switch from {sourceDeck.algorithm.toUpperCase()} to{' '}
                {targetDeck.algorithm.toUpperCase()} algorithm.
              </span>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={deleteSource}
              onChange={(e) => setDeleteSource(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-foreground">Delete source deck after merge</span>
          </label>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={!canMerge || isLoading}>
            {isLoading ? 'Merging...' : 'Merge Decks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
