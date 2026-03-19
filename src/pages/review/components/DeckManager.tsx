import { useEffect, useState } from 'react';
import { Plus, Brain, Trash2, Merge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineError } from '@/components/common/InlineError';
import { useReviewStore } from '../stores/reviewStore';
import { AlgorithmBadge } from './AlgorithmBadge';
import { CreateDeckDialog } from './CreateDeckDialog';
import { MergeDeckDialog } from './MergeDeckDialog';

interface Props {
  onSelectDeck: (deckId: string) => void;
  onStartReview: (deckId: string) => void;
}

export function DeckManager({ onSelectDeck, onStartReview }: Props) {
  const { decks, isLoadingDecks, error, fetchDecks, deleteDeck, clearError } = useReviewStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  const totalDue = decks.reduce((sum, d) => sum + d.dueToday, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">SRS Review</h2>
          <p className="text-sm text-muted-foreground">
            {totalDue > 0 ? `${totalDue} cards due today` : 'All caught up!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {decks.length >= 2 && (
            <Button variant="outline" onClick={() => setShowMerge(true)}>
              <Merge className="mr-2 h-4 w-4" />
              Merge Decks
            </Button>
          )}
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Deck
          </Button>
        </div>
      </div>

      {error && <InlineError message={error} onDismiss={clearError} />}

      {isLoadingDecks ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : decks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Brain className="h-12 w-12 text-muted-foreground/40" />
            <div className="text-center">
              <p className="font-medium text-foreground">No decks yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first deck to start learning
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Deck
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {decks.map((deck) => (
            <Card
              key={deck.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => onSelectDeck(deck.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{deck.name}</CardTitle>
                    <AlgorithmBadge algorithm={deck.algorithm} />
                  </div>
                  <div className="flex items-center gap-2">
                    {deck.dueToday > 0 && (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartReview(deck.id);
                        }}
                      >
                        Review ({deck.dueToday})
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this deck and all its cards?')) {
                          deleteDeck(deck.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-error" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{deck.cardCount} cards</span>
                  <span className="text-foreground/30">|</span>
                  <span>{deck.language.toUpperCase()}</span>
                  {deck.dueToday > 0 && (
                    <>
                      <span className="text-foreground/30">|</span>
                      <span className="text-accent font-medium">{deck.dueToday} due</span>
                    </>
                  )}
                  {deck.newCards > 0 && (
                    <>
                      <span className="text-foreground/30">|</span>
                      <span className="text-success">{deck.newCards} new</span>
                    </>
                  )}
                </div>
                {deck.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{deck.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateDeckDialog open={showCreate} onOpenChange={setShowCreate} />
      <MergeDeckDialog
        open={showMerge}
        onOpenChange={setShowMerge}
        decks={decks}
        onMerged={() => fetchDecks()}
      />
    </div>
  );
}
