import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowLeft, Play, MoreHorizontal, Trash2, Check, X, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReviewStore } from '../stores/reviewStore';

interface SessionData {
  id: string;
  deck_id: string | null;
  algorithm: string;
  status: string;
  total_cards: number;
  reviewed_cards: number;
  correct_count: number;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number;
  session_name: string;
}

interface CardData {
  id: string;
  front: string;
  back: string;
  translation: string | null;
  word: string;
}

interface ResultData {
  card_id: string;
  rating: string;
  confidence: number;
  was_correct: boolean;
  time_spent_ms: number;
}

interface SessionDetail {
  session: SessionData;
  cards: CardData[];
  results: ResultData[];
}

type RatingFilter = 'all' | 1 | 2 | 3 | 4 | 5 | 'lt3' | 'lt4';

const RATING_COLORS: Record<number, string> = {
  1: 'bg-[#DF804D] text-white',
  2: 'bg-[#C58C6E] text-white',
  3: 'bg-[#9A8A6E] text-white',
  4: 'bg-[#6B8A5E] text-white',
  5: 'bg-primary text-primary-foreground',
};

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { startSession } = useReviewStore();

  const [data, setData] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyMistakes, setShowOnlyMistakes] = useState(false);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setIsLoading(true);
    invoke<SessionDetail>('srs_get_session_detail', { sessionId })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setIsLoading(false));
  }, [sessionId]);

  // Build card results map
  const resultsByCard = useMemo(() => {
    if (!data) return new Map<string, ResultData>();
    const map = new Map<string, ResultData>();
    for (const r of data.results) {
      map.set(r.card_id, r);
    }
    return map;
  }, [data]);

  // Filter cards
  const filteredCards = useMemo(() => {
    if (!data) return [];
    return data.cards.filter((card) => {
      const result = resultsByCard.get(card.id);
      if (showOnlyMistakes && result?.was_correct) return false;
      if (ratingFilter !== 'all' && result) {
        if (ratingFilter === 'lt3' && result.confidence >= 3) return false;
        if (ratingFilter === 'lt4' && result.confidence >= 4) return false;
        if (typeof ratingFilter === 'number' && result.confidence !== ratingFilter) return false;
      }
      return true;
    });
  }, [data, resultsByCard, showOnlyMistakes, ratingFilter]);

  const mistakeCardIds = useMemo(() => {
    if (!data) return [];
    return data.results.filter((r) => !r.was_correct).map((r) => r.card_id);
  }, [data]);

  const handleDelete = async () => {
    if (!sessionId) return;
    setIsDeleting(true);
    try {
      await invoke('srs_delete_session', { sessionId });
      navigate('/review/history');
    } catch (e) {
      setError(String(e));
    } finally {
      setIsDeleting(false);
    }
  };

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-destructive">{error || 'Session not found'}</p>
        <Button variant="outline" onClick={() => navigate('/review/history')}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to History
        </Button>
      </div>
    );
  }

  const { session } = data;
  const accuracy = session.reviewed_cards > 0
    ? Math.round((session.correct_count / session.reviewed_cards) * 100)
    : 0;
  const incorrectCount = session.reviewed_cards - session.correct_count;
  const isActive = session.status === 'in_progress';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/review/history')}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">{session.session_name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                session.status === 'completed' ? 'bg-[#8BB7A3]/20 text-[#8BB7A3]' :
                isActive ? 'bg-[#C58C6E]/20 text-[#C58C6E]' :
                'bg-muted text-muted-foreground'
              }`}>
                {session.status === 'completed' ? 'Completed' :
                 isActive ? 'In Progress' :
                 session.status.charAt(0).toUpperCase() + session.status.slice(1)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(session.started_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isActive && session.deck_id && (
            <Button
              size="sm"
              onClick={() => {
                startSession(session.deck_id!).then(() => {
                  navigate(`/review/session/${session.id}`);
                });
              }}
            >
              <Play className="w-3.5 h-3.5 mr-1" /> Continue
            </Button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 py-1 w-44">
                  {isActive && session.deck_id && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        startSession(session.deck_id!).then(() => {
                          navigate(`/review/session/${session.id}`);
                        });
                      }}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2"
                    >
                      <Play className="w-3.5 h-3.5" /> Continue Review
                    </button>
                  )}
                  <button
                    onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
                    className="w-full px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{session.total_cards}</p>
          <p className="text-xs text-muted-foreground">Total Cards</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{session.reviewed_cards}</p>
          <p className="text-xs text-muted-foreground">Cards Reviewed</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[#8BB7A3]">{session.correct_count}</p>
          <p className="text-xs text-muted-foreground">Correct</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{accuracy}%</p>
          <p className="text-xs text-muted-foreground">Accuracy</p>
        </div>
      </div>

      {/* Session Info */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        {session.completed_at && (
          <span>Ended: {formatDate(session.completed_at)}</span>
        )}
        <span>Algorithm: {session.algorithm.toUpperCase()}</span>
      </div>

      {/* Cards Section */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Only Mistakes toggle */}
          <button
            onClick={() => setShowOnlyMistakes(!showOnlyMistakes)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showOnlyMistakes
                ? 'bg-destructive/10 text-destructive border border-destructive/30'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {showOnlyMistakes && <Check className="w-3 h-3" />}
            Only Mistakes
          </button>

          <div className="h-4 w-px bg-border" />

          {/* Rating filters */}
          {(['all', 1, 2, 3, 4, 5, 'lt3', 'lt4'] as RatingFilter[]).map((f) => (
            <button
              key={String(f)}
              onClick={() => setRatingFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                ratingFilter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'All' : f === 'lt3' ? '< 3' : f === 'lt4' ? '< 4' : f}
            </button>
          ))}
        </div>

        {/* Card List */}
        {filteredCards.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No cards match the current filter
          </p>
        ) : (
          <div className="space-y-2">
            {filteredCards.map((card, index) => {
              const result = resultsByCard.get(card.id);
              const wasCorrect = result?.was_correct ?? null;
              const confidence = result?.confidence;

              return (
                <div
                  key={card.id}
                  className={`rounded-lg p-3 flex items-center gap-3 ${
                    wasCorrect === true ? 'bg-[#8BB7A3]/5 border border-[#8BB7A3]/20' :
                    wasCorrect === false ? 'bg-destructive/5 border border-destructive/20' :
                    'bg-muted/30 border border-border'
                  }`}
                >
                  {/* Index */}
                  <span className="text-xs text-muted-foreground w-6 text-right font-mono shrink-0">
                    {index + 1}
                  </span>

                  {/* Correct/Incorrect badge */}
                  {wasCorrect !== null && (
                    <span className={`shrink-0 ${
                      wasCorrect ? 'text-[#8BB7A3]' : 'text-destructive'
                    }`}>
                      {wasCorrect ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </span>
                  )}

                  {/* Rating badge */}
                  {confidence && (
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${RATING_COLORS[confidence] ?? 'bg-muted text-muted-foreground'}`}>
                      {confidence}
                    </span>
                  )}

                  {/* Card content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{card.front}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {card.translation || card.back}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete Session?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will permanently delete this review session and its history.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
