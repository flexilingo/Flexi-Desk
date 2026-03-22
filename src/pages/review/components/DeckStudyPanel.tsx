import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Play, Settings, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReviewStore } from '../stores/reviewStore';
import { CreateReviewDialog } from './CreateReviewDialog';

interface DeckProgress {
  total_cards: number;
  mastered_count: number;
  familiar_count: number;
  learning_count: number;
  new_count: number;
}

interface TodayStudy {
  due_count: number;
  new_available: number;
  total_session_size: number;
}

interface ActiveSession {
  id: string;
  reviewed_cards: number;
  total_cards: number;
}

interface DeckStatsResponse {
  deck_progress: DeckProgress;
  today_study: TodayStudy;
  active_session: ActiveSession | null;
}

interface Props {
  deckId: string;
}

export function DeckStudyPanel({ deckId }: Props) {
  const navigate = useNavigate();
  const { startSession, loadSessionCards } = useReviewStore();

  const [stats, setStats] = useState<DeckStatsResponse | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  useEffect(() => {
    invoke<DeckStatsResponse>('srs_get_deck_stats', { deckId })
      .then(setStats)
      .catch(() => {});
  }, [deckId]);

  if (!stats) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  const { deck_progress: dp, today_study: ts, active_session: activeSession } = stats;
  const masteredPercent = dp.total_cards > 0 ? Math.round((dp.mastered_count / dp.total_cards) * 100) : 0;
  const familiarPercent = dp.total_cards > 0 ? Math.round((dp.familiar_count / dp.total_cards) * 100) : 0;
  const learningPercent = dp.total_cards > 0 ? Math.round((dp.learning_count / dp.total_cards) * 100) : 0;
  const newPercent = dp.total_cards > 0 ? Math.round((dp.new_count / dp.total_cards) * 100) : 0;
  const isComplete = dp.mastered_count === dp.total_cards && dp.total_cards > 0;

  const handleStudyNow = async () => {
    setIsStarting(true);
    setError(null);
    try {
      // Quick Study pattern: resume active session if exists
      if (activeSession) {
        // Load existing session cards
        const { mapSession } = await import('../types');
        const rawSession = await invoke<any>('srs_get_session_detail', { sessionId: activeSession.id });
        // Navigate to practice
        navigate(`/review/session/${activeSession.id}`);
        return;
      }

      // Create new session
      await startSession(deckId);
      const session = useReviewStore.getState().session;
      if (session) {
        navigate(`/review/session/${session.id}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStarting(false);
    }
  };

  const handleContinue = () => {
    if (activeSession) {
      // Load session and navigate
      startSession(deckId).then(() => {
        navigate(`/review/session/${activeSession.id}`);
      });
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      {/* Deck Complete Banner */}
      {isComplete && (
        <div className="bg-[#8BB7A3]/10 border border-[#8BB7A3]/20 rounded-xl p-4 text-center space-y-2">
          <PartyPopper className="w-8 h-8 mx-auto text-[#8BB7A3]" />
          <p className="text-sm font-semibold text-[#8BB7A3]">Deck Complete!</p>
          <p className="text-xs text-muted-foreground">All cards have been mastered</p>
        </div>
      )}

      {/* Deck Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-foreground">Deck Progress</span>
          <span className="text-sm text-muted-foreground">
            {dp.mastered_count}/{dp.total_cards} ({masteredPercent}%)
          </span>
        </div>
        {/* 4-segment progress bar */}
        <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex">
          {masteredPercent > 0 && (
            <div className="h-full bg-[#8BB7A3]" style={{ width: `${masteredPercent}%` }} />
          )}
          {familiarPercent > 0 && (
            <div className="h-full bg-[#6B705C]" style={{ width: `${familiarPercent}%` }} />
          )}
          {learningPercent > 0 && (
            <div className="h-full bg-[#C58C6E]" style={{ width: `${learningPercent}%` }} />
          )}
          {newPercent > 0 && (
            <div className="h-full bg-gray-300 dark:bg-gray-600" style={{ width: `${newPercent}%` }} />
          )}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#8BB7A3]" />
            {dp.mastered_count} Mastered
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#6B705C]" />
            {dp.familiar_count} Familiar
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#C58C6E]" />
            {dp.learning_count} Learning
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
            {dp.new_count} New
          </span>
        </div>
      </div>

      {/* Today's Study */}
      {!isComplete && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">Today's Study</p>

          {/* Active session: Continue */}
          {activeSession ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Session in progress: {activeSession.reviewed_cards}/{activeSession.total_cards} cards
              </p>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(activeSession.reviewed_cards / activeSession.total_cards) * 100}%` }}
                />
              </div>
              <Button className="w-full" onClick={handleContinue} disabled={isStarting}>
                {isStarting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                ) : (
                  <Play className="w-4 h-4 mr-1.5" />
                )}
                Continue
              </Button>
            </div>
          ) : ts.total_session_size > 0 ? (
            /* Cards available */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                {ts.due_count > 0 && (
                  <span className="text-[#C58C6E] font-medium">{ts.due_count} due</span>
                )}
                {ts.due_count > 0 && ts.new_available > 0 && (
                  <span className="text-muted-foreground">+</span>
                )}
                {ts.new_available > 0 && (
                  <span className="text-[#8BB7A3] font-medium">{ts.new_available} new</span>
                )}
                <span className="text-muted-foreground">=</span>
                <span className="font-semibold text-foreground">{ts.total_session_size} cards</span>
              </div>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleStudyNow} disabled={isStarting}>
                  {isStarting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  ) : (
                    <Play className="w-4 h-4 mr-1.5" />
                  )}
                  Study Now
                </Button>
                <button
                  onClick={() => setCustomDialogOpen(true)}
                  className="p-2.5 rounded-xl border border-border hover:bg-muted transition-colors"
                  title="Custom session"
                >
                  <Settings className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          ) : (
            /* All caught up */
            <div className="space-y-3">
              <div className="text-center py-2">
                <p className="text-sm font-medium text-foreground">All Caught Up</p>
                <p className="text-xs text-muted-foreground mt-0.5">Next review in 24 hours</p>
              </div>
              <button
                onClick={() => setCustomDialogOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-border hover:bg-muted transition-colors text-sm text-muted-foreground"
              >
                <Settings className="w-4 h-4" />
                Custom Session
              </button>
            </div>
          )}
        </div>
      )}

      {/* Custom Session Dialog */}
      <CreateReviewDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        initialDeckId={deckId}
        onSessionCreated={(sessionId) => {
          navigate(`/review/session/${sessionId}`);
        }}
      />
    </div>
  );
}
