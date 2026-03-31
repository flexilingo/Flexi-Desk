import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Search, Trash2, MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CefrBadge } from '@/components/common/CefrBadge';
import { useReviewStore } from '../stores/reviewStore';
import { AlgorithmBadge } from './AlgorithmBadge';
import { DeckStudyPanel } from './DeckStudyPanel';
import { AddCardDialog } from './AddCardDialog';
import { ExportHub } from './deck-hub/ExportHub';

const PAGE_SIZE = 20;

export function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const {
    decks, deckCards, isLoadingCards,
    fetchDecks, fetchDeckCards, deleteDeck, deleteCard,
  } = useReviewStore();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [deleteConfirmCard, setDeleteConfirmCard] = useState<string | null>(null);
  const [deleteConfirmDeck, setDeleteConfirmDeck] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const deck = decks.find((d) => d.id === deckId);

  useEffect(() => {
    if (deckId) {
      fetchDeckCards(deckId);
      if (decks.length === 0) fetchDecks();
    }
  }, [deckId, fetchDeckCards, fetchDecks, decks.length]);

  const filteredCards = useMemo(() => {
    if (!search.trim()) return deckCards;
    const q = search.toLowerCase();
    return deckCards.filter(
      (c) =>
        c.front.toLowerCase().includes(q) ||
        (c.translation?.toLowerCase().includes(q)),
    );
  }, [deckCards, search]);

  const totalPages = Math.ceil(filteredCards.length / PAGE_SIZE);
  const paginatedCards = filteredCards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDeleteCard = async (cardId: string) => {
    await deleteCard(cardId);
    if (deckId) fetchDeckCards(deckId);
    setDeleteConfirmCard(null);
  };

  const handleDeleteDeck = async () => {
    if (!deckId) return;
    await deleteDeck(deckId);
    navigate('/review');
  };

  if (!deckId) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/review')}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">{deck?.name ?? 'Deck'}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {deck && <AlgorithmBadge algorithm={deck.algorithm} />}
              <span className="text-xs text-muted-foreground">
                {deck?.cardCount ?? deckCards.length} cards · {deck?.language.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMore(!showMore)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
          </button>
          {showMore && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} />
              <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 py-1 w-40">
                <button
                  onClick={() => {
                    setShowMore(false);
                    setDeleteConfirmDeck(true);
                  }}
                  className="w-full px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Deck
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Study Panel */}
      <DeckStudyPanel deckId={deckId} />

      {/* Export & Sync */}
      <div className="border border-border rounded-xl p-4">
        <ExportHub deckId={deckId} />
      </div>

      {/* Cards Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cards ({filteredCards.length})</h2>
          <Button size="sm" onClick={() => setAddCardOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Card
          </Button>
        </div>

        {/* Search */}
        {deckCards.length > 5 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search cards..."
              className="pl-9"
            />
          </div>
        )}

        {/* Card List */}
        {isLoadingCards ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading cards...</p>
        ) : paginatedCards.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">{search ? 'No cards match your search' : 'No cards yet'}</p>
            {!search && (
              <Button size="sm" className="mt-3" onClick={() => setAddCardOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add First Card
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {paginatedCards.map((card) => (
              <div
                key={card.id}
                className="bg-card border border-border rounded-lg p-3 flex items-center justify-between group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{card.front}</span>
                    <span className="text-sm text-muted-foreground">→</span>
                    <span className="text-sm text-muted-foreground truncate">{card.translation || card.back}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {card.cefrLevel && <CefrBadge level={card.cefrLevel} />}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      card.state === 'new' ? 'bg-[#8BB7A3]/20 text-[#8BB7A3]' :
                      card.state === 'learning' || card.state === 'relearning' ? 'bg-[#C58C6E]/20 text-[#C58C6E]' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {card.state}
                    </span>
                    {card.reviewCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {card.reviewCount} reviews
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setDeleteConfirmCard(card.id)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Delete Card Confirmation */}
      {deleteConfirmCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirmCard(null)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete Card?</h3>
            <p className="text-sm text-muted-foreground mb-4">This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmCard(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={() => handleDeleteCard(deleteConfirmCard)}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Deck Confirmation */}
      {deleteConfirmDeck && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirmDeck(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete Deck?</h3>
            <p className="text-sm text-muted-foreground mb-4">This will permanently delete the deck and all its cards.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmDeck(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteDeck}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <AddCardDialog open={addCardOpen} onOpenChange={setAddCardOpen} deckId={deckId} language={deck?.language ?? 'en'} />
    </div>
  );
}
