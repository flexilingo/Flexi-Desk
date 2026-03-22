import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReviewStore } from '../stores/reviewStore';
import { ReviewSession } from './ReviewSession';
import { SessionSummary } from './SessionSummary';

export function ReviewSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, sessionComplete, summary, resetSession, startSession, fetchDecks } =
    useReviewStore();

  // If no active session and we have a sessionId param, we'd need to resume
  // For now, if no session, redirect back
  useEffect(() => {
    if (!session && !sessionComplete) {
      navigate('/review', { replace: true });
    }
  }, [session, sessionComplete, navigate]);

  const handleReviewAgain = () => {
    const deckId = session?.deckId;
    resetSession();
    if (deckId) {
      startSession(deckId).then(() => {
        // Stay on session page
      });
    } else {
      navigate('/review');
    }
  };

  const handleBackToDecks = () => {
    resetSession();
    navigate('/review');
    fetchDecks();
  };

  // Session complete — show summary
  if (sessionComplete && summary) {
    return (
      <div className="-m-6 h-[calc(100dvh-3.5rem)] overflow-y-auto">
        <SessionSummary
          summary={summary}
          onReviewAgain={handleReviewAgain}
          onBackToDecks={handleBackToDecks}
        />
      </div>
    );
  }

  // Active session — full-height practice
  if (session) {
    return (
      <div className="-m-6 h-[calc(100dvh-3.5rem)] overflow-hidden">
        <ReviewSession />
      </div>
    );
  }

  return null;
}
