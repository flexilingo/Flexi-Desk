import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  Brain, Plus, Search, Trash2, Merge, Clock, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReviewStore } from '../stores/reviewStore';
import { AlgorithmBadge } from './AlgorithmBadge';
import { CreateDeckDialog } from './CreateDeckDialog';
import { MergeDeckDialog } from './MergeDeckDialog';

interface SessionListItem {
  id: string;
  deck_id: string | null;
  deck_name: string;
  algorithm: string;
  status: string;
  total_cards: number;
  reviewed_cards: number;
  correct_count: number;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number;
}

export function ReviewOverview() {
  const navigate = useNavigate();
  const { decks, isLoadingDecks, fetchDecks, deleteDeck, startSession } = useReviewStore();

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);
  const [isStarting, setIsStarting] = useState<string | null>(null);

  useEffect(() => {
    fetchDecks();
    // Load recent sessions
    invoke<SessionListItem[]>('srs_list_sessions', { limit: 5 })
      .then(setRecentSessions)
      .catch(() => {});
  }, [fetchDecks]);

  const filteredDecks = useMemo(() => {
    if (!search.trim()) return decks;
    const q = search.toLowerCase();
    return decks.filter((d) => d.name.toLowerCase().includes(q));
  }, [decks, search]);

  const totalDue = useMemo(() => decks.reduce((sum, d) => sum + d.dueToday, 0), [decks]);
  const totalNew = useMemo(() => decks.reduce((sum, d) => sum + d.newCards, 0), [decks]);

  const handleStartReview = async (deckId: string) => {
    setIsStarting(deckId);
    try {
      await startSession(deckId);
      navigate(`/review/session/${deckId}`);
    } catch {
      // Error handled in store
    } finally {
      setIsStarting(null);
    }
  };

  const handleDeleteDeck = async (id: string) => {
    await deleteDeck(id);
    setDeleteConfirm(null);
  };

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SRS Review</h1>
          {(totalDue > 0 || totalNew > 0) && (
            <p className="text-sm text-muted-foreground mt-1">
              Today: {totalDue} cards due · {totalNew} new
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {decks.length >= 2 && (
            <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
              <Merge className="w-4 h-4 mr-1.5" />
              Merge
            </Button>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Deck
          </Button>
        </div>
      </div>

      {/* Search */}
      {decks.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search decks..."
            className="pl-9"
          />
        </div>
      )}

      {/* Deck Grid */}
      {isLoadingDecks ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading decks...</p>
      ) : filteredDecks.length === 0 && decks.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <Brain className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <div>
            <p className="text-lg font-medium text-foreground">No decks yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first deck to start reviewing
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create Deck
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDecks.map((deck) => (
            <div
              key={deck.id}
              className="group bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer"
              onClick={() => navigate(`/review/deck/${deck.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{deck.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <AlgorithmBadge algorithm={deck.algorithm} />
                    <span className="text-xs text-muted-foreground">{deck.language.toUpperCase()}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(deck.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{deck.cardCount} cards</span>
                <div className="flex items-center gap-2">
                  {deck.dueToday > 0 && (
                    <span className="text-xs text-[#C58C6E] font-medium">{deck.dueToday} due</span>
                  )}
                  {deck.newCards > 0 && (
                    <span className="text-xs text-[#8BB7A3] font-medium">{deck.newCards} new</span>
                  )}
                </div>
              </div>

              {(deck.dueToday > 0 || deck.newCards > 0) && (
                <Button
                  size="sm"
                  className="w-full mt-3"
                  disabled={isStarting === deck.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartReview(deck.id);
                  }}
                >
                  {isStarting === deck.id ? 'Starting...' : 'Review'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete Deck?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will permanently delete the deck and all its cards.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={() => handleDeleteDeck(deleteConfirm)}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Recent Sessions</h2>
            <button
              onClick={() => navigate('/review/history')}
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              View History <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {recentSessions.map((s) => {
              const accuracy = s.reviewed_cards > 0
                ? Math.round((s.correct_count / s.reviewed_cards) * 100)
                : 0;
              return (
                <div
                  key={s.id}
                  className="bg-card border border-border rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.deck_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.reviewed_cards}/{s.total_cards} cards · {accuracy}% · {timeAgo(s.started_at)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      s.status === 'completed'
                        ? 'bg-[#8BB7A3]/20 text-[#8BB7A3]'
                        : s.status === 'in_progress'
                        ? 'bg-[#C58C6E]/20 text-[#C58C6E]'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {s.status === 'completed' ? 'Done' : s.status === 'in_progress' ? 'Active' : s.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateDeckDialog open={createOpen} onOpenChange={setCreateOpen} />
      {decks.length >= 2 && (
        <MergeDeckDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          decks={decks}
          onMerged={() => { setMergeOpen(false); fetchDecks(); }}
        />
      )}
    </div>
  );
}
