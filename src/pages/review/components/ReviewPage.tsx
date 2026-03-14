import { useState } from 'react';
import { useReviewStore } from '../stores/reviewStore';
import { DeckManager } from './DeckManager';
import { DeckDetail } from './DeckDetail';
import { ReviewSession } from './ReviewSession';
import { SessionSummary } from './SessionSummary';

type View = 'decks' | 'detail' | 'session' | 'summary';

export function ReviewPage() {
  const { session, sessionComplete, summary, startSession, resetSession, fetchDecks } =
    useReviewStore();

  const [view, setView] = useState<View>('decks');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);

  const handleSelectDeck = (deckId: string) => {
    setSelectedDeckId(deckId);
    setView('detail');
  };

  const handleStartReview = async (deckId: string) => {
    setSelectedDeckId(deckId);
    await startSession(deckId);
    setView('session');
  };

  const handleBackToDecks = () => {
    resetSession();
    setSelectedDeckId(null);
    setView('decks');
    fetchDecks();
  };

  const handleReviewAgain = () => {
    if (selectedDeckId) {
      resetSession();
      handleStartReview(selectedDeckId);
    }
  };

  // Auto-transition to summary when session completes
  if (sessionComplete && summary && view === 'session') {
    return (
      <SessionSummary
        summary={summary}
        onReviewAgain={handleReviewAgain}
        onBackToDecks={handleBackToDecks}
      />
    );
  }

  // Active session overrides view
  if (session && view === 'session') {
    return <ReviewSession />;
  }

  if (view === 'detail' && selectedDeckId) {
    return (
      <DeckDetail
        deckId={selectedDeckId}
        onBack={handleBackToDecks}
        onStartReview={handleStartReview}
      />
    );
  }

  return <DeckManager onSelectDeck={handleSelectDeck} onStartReview={handleStartReview} />;
}
