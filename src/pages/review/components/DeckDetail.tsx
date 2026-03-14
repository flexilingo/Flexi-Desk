import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { CefrBadge } from '@/components/common/CefrBadge';
import { useReviewStore } from '../stores/reviewStore';
import { AddCardDialog } from './AddCardDialog';
import { AlgorithmBadge } from './AlgorithmBadge';

interface Props {
  deckId: string;
  onBack: () => void;
  onStartReview: (deckId: string) => void;
}

export function DeckDetail({ deckId, onBack, onStartReview }: Props) {
  const { decks, deckCards, isLoadingCards, fetchDeckCards, deleteCard } = useReviewStore();
  const [showAddCard, setShowAddCard] = useState(false);

  const deck = decks.find((d) => d.id === deckId);

  useEffect(() => {
    fetchDeckCards(deckId);
  }, [deckId, fetchDeckCards]);

  if (!deck) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">{deck.name}</h2>
            <AlgorithmBadge algorithm={deck.algorithm} />
          </div>
          <p className="text-sm text-muted-foreground">
            {deck.cardCount} cards · {deck.language.toUpperCase()}
            {deck.dueToday > 0 && ` · ${deck.dueToday} due`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddCard(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Card
          </Button>
          {deck.dueToday > 0 && (
            <Button onClick={() => onStartReview(deckId)}>
              <Play className="mr-2 h-4 w-4" />
              Review ({deck.dueToday})
            </Button>
          )}
        </div>
      </div>

      {isLoadingCards ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : deckCards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <p className="text-muted-foreground">No cards in this deck yet.</p>
            <Button onClick={() => setShowAddCard(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {deckCards.map((card) => (
            <Card key={card.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="font-medium text-foreground">{card.front}</div>
                    <div className="text-sm text-muted-foreground">{card.back}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {card.cefrLevel && <CefrBadge level={card.cefrLevel} />}
                  <Badge
                    variant={
                      card.state === 'new'
                        ? 'secondary'
                        : card.state === 'review'
                          ? 'success'
                          : 'warning'
                    }
                  >
                    {card.state}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{card.reviewCount} reviews</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm('Delete this card?')) deleteCard(card.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-error" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddCardDialog
        open={showAddCard}
        onOpenChange={setShowAddCard}
        deckId={deckId}
        language={deck.language}
      />
    </div>
  );
}
